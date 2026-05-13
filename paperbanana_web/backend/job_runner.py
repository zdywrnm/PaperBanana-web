from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import Settings
from .database import JobStore
from .schemas import GenerateJobRequest


@dataclass
class QueuedJob:
    job_id: str
    request: GenerateJobRequest
    selected_api_key: str


class JobRunner:
    def __init__(self, settings: Settings, store: JobStore):
        self.settings = settings
        self.store = store
        self.queue: asyncio.Queue[QueuedJob] = asyncio.Queue()
        self.worker_task: asyncio.Task | None = None

    def start(self) -> None:
        if self.worker_task is None or self.worker_task.done():
            self.worker_task = asyncio.create_task(self._worker_loop())

    async def enqueue(self, request: GenerateJobRequest, client_ip: str, user_agent: str) -> str:
        if request.num_candidates > self.settings.max_candidates:
            raise ValueError(f"num_candidates cannot exceed {self.settings.max_candidates}.")
        if request.max_critic_rounds > self.settings.max_critic_rounds:
            raise ValueError(f"max_critic_rounds cannot exceed {self.settings.max_critic_rounds}.")

        selected_api_key = self._selected_key(request)
        if not selected_api_key and not (request.mock and self.settings.allow_mock_generation):
            raise ValueError(f"Missing API key for provider '{request.provider}'.")

        job_id = uuid.uuid4().hex
        self.store.create_job(
            {
                "id": job_id,
                "provider": request.provider,
                "task_name": request.task_name,
                "main_model_name": request.main_model_name,
                "image_gen_model_name": request.image_gen_model_name,
                "pipeline_mode": request.pipeline_mode,
                "retrieval_setting": request.retrieval_setting,
                "aspect_ratio": request.aspect_ratio,
                "num_candidates": request.num_candidates,
                "max_critic_rounds": request.max_critic_rounds,
                "method_content": request.method_content,
                "caption": request.caption,
                "prompt_char_count": len(request.method_content) + len(request.caption),
                "client_ip": client_ip,
                "user_agent": user_agent,
            }
        )
        await self.queue.put(QueuedJob(job_id=job_id, request=request, selected_api_key=selected_api_key))
        return job_id

    async def _worker_loop(self) -> None:
        while True:
            job = await self.queue.get()
            try:
                await self._run_job(job)
            except Exception as exc:
                self.store.mark_failed(job.job_id, str(exc))
            finally:
                self.queue.task_done()

    async def _run_job(self, job: QueuedJob) -> None:
        self.store.mark_running(job.job_id)
        output_dir = self.settings.results_dir / job.job_id
        output_dir.mkdir(parents=True, exist_ok=True)
        spec_path = output_dir / "job-spec.json"
        spec = self._spec_from_request(job.request)
        spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")

        command = [
            sys.executable,
            "-m",
            "paperbanana_web.backend.worker_run",
            "--spec",
            str(spec_path),
            "--out",
            str(output_dir),
        ]
        if job.request.mock and self.settings.allow_mock_generation:
            command.append("--mock")

        env = self._subprocess_env(job)
        timeout = int(os.getenv("PAPERBANANA_JOB_TIMEOUT_SECONDS", "1800"))
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(Path(__file__).resolve().parents[2]),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await asyncio.wait_for(process.communicate(), timeout=timeout)
        stdout = stdout_bytes.decode("utf-8", errors="replace")
        stderr = stderr_bytes.decode("utf-8", errors="replace")
        logs = (stdout + "\n" + stderr).strip()

        try:
            spec_path.unlink(missing_ok=True)
        except OSError:
            pass

        if process.returncode != 0:
            self.store.mark_failed(job.job_id, f"Generation process exited with code {process.returncode}.", logs)
            return

        output_json_path = output_dir / "job-output.json"
        if not output_json_path.exists():
            self.store.mark_failed(job.job_id, "Generation process did not produce job-output.json.", logs)
            return

        output = json.loads(output_json_path.read_text(encoding="utf-8"))
        images = []
        for item in output.get("images", []):
            filename = item["filename"]
            if not self._is_safe_result_file(output_dir, filename):
                continue
            images.append(
                {
                    "candidate_id": item["candidate_id"],
                    "filename": filename,
                    "url": f"/api/jobs/{job.job_id}/images/{filename}",
                }
            )

        if not images:
            self.store.mark_failed(job.job_id, "No images were produced.", logs)
            return

        self.store.mark_succeeded(job.job_id, images, logs)

    def _spec_from_request(self, request: GenerateJobRequest) -> dict[str, Any]:
        return {
            "provider": request.provider,
            "task_name": request.task_name,
            "method_content": request.method_content,
            "caption": request.caption,
            "main_model_name": request.main_model_name,
            "image_gen_model_name": request.image_gen_model_name,
            "pipeline_mode": request.pipeline_mode,
            "retrieval_setting": request.retrieval_setting,
            "aspect_ratio": request.aspect_ratio,
            "num_candidates": request.num_candidates,
            "max_critic_rounds": request.max_critic_rounds,
        }

    def _selected_key(self, request: GenerateJobRequest) -> str:
        if request.provider == "openrouter":
            return request.api_keys.openrouter.strip()
        if request.provider == "gemini":
            return request.api_keys.gemini.strip()
        if request.provider == "openai":
            return request.api_keys.openai.strip()
        return ""

    def _subprocess_env(self, job: QueuedJob) -> dict[str, str]:
        env = os.environ.copy()
        env["PYTHONPATH"] = str(Path(__file__).resolve().parents[2])
        env["PAPERBANANA_IGNORE_MODEL_CONFIG"] = "1"
        env["OPENROUTER_API_KEY"] = ""
        env["GOOGLE_API_KEY"] = ""
        env["OPENAI_API_KEY"] = ""
        env["ANTHROPIC_API_KEY"] = ""
        if job.request.provider == "openrouter":
            env["OPENROUTER_API_KEY"] = job.selected_api_key
        elif job.request.provider == "gemini":
            env["GOOGLE_API_KEY"] = job.selected_api_key
        elif job.request.provider == "openai":
            env["OPENAI_API_KEY"] = job.selected_api_key
        return env

    def _is_safe_result_file(self, output_dir: Path, filename: str) -> bool:
        target = (output_dir / filename).resolve()
        try:
            return target.is_file() and target.is_relative_to(output_dir.resolve())
        except AttributeError:
            return target.is_file() and os.path.commonpath([str(target), str(output_dir.resolve())]) == str(output_dir.resolve())

    def clear_job_files(self, job_id: str) -> None:
        shutil.rmtree(self.settings.results_dir / job_id, ignore_errors=True)
