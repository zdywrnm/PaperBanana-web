from __future__ import annotations

import os
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import PROJECT_ROOT, get_settings
from .database import JobStore
from .job_runner import JobRunner
from .schemas import AdminJobListResponse, CreateJobResponse, GenerateJobRequest, JobResponse
from .serializer import job_to_response


def create_app() -> FastAPI:
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.results_dir.mkdir(parents=True, exist_ok=True)

    store = JobStore(settings.database_path)
    runner = JobRunner(settings, store)

    app = FastAPI(title="PaperBanana Web API", version="0.1.0")
    app.state.settings = settings
    app.state.store = store
    app.state.runner = runner

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    assets_dir = PROJECT_ROOT / "assets"
    if assets_dir.exists():
        app.mount("/paper-assets", StaticFiles(directory=assets_dir), name="paper-assets")

    @app.on_event("startup")
    async def startup() -> None:
        app.state.runner.start()

    @app.get("/api/health")
    async def health() -> dict[str, object]:
        return {
            "ok": True,
            "mock_enabled": settings.allow_mock_generation,
            "max_candidates": settings.max_candidates,
            "max_critic_rounds": settings.max_critic_rounds,
        }

    @app.post("/api/jobs", response_model=CreateJobResponse)
    async def create_job(payload: GenerateJobRequest, request: Request) -> CreateJobResponse:
        client_ip = request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")
        user_agent = request.headers.get("user-agent", "")
        try:
            job_id = await app.state.runner.enqueue(payload, client_ip=client_ip, user_agent=user_agent)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return CreateJobResponse(id=job_id, status="queued")

    @app.get("/api/jobs/{job_id}", response_model=JobResponse)
    async def get_job(job_id: str) -> dict:
        row = app.state.store.get_job(job_id)
        if not row:
            raise HTTPException(status_code=404, detail="Job not found.")
        return job_to_response(row, include_prompt=True)

    @app.get("/api/jobs/{job_id}/images/{filename}")
    async def get_job_image(job_id: str, filename: str) -> FileResponse:
        base = (settings.results_dir / job_id).resolve()
        target = (base / filename).resolve()
        if not _is_safe_child(base, target) or not target.is_file():
            raise HTTPException(status_code=404, detail="Image not found.")
        return FileResponse(target)

    @app.get("/api/admin/jobs", response_model=AdminJobListResponse)
    async def list_admin_jobs(
        limit: int = 100,
        x_admin_token: str = Header(default=""),
    ) -> dict:
        _require_admin_token(settings.admin_token, x_admin_token)
        rows = app.state.store.list_jobs(limit=max(1, min(limit, 500)))
        return {"jobs": [job_to_response(row, include_prompt=True) for row in rows]}

    if settings.frontend_dist_dir.exists():
        assets_dir = settings.frontend_dist_dir / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{path:path}")
        async def serve_spa(path: str) -> FileResponse:
            target = (settings.frontend_dist_dir / path).resolve()
            if path and _is_safe_child(settings.frontend_dist_dir, target) and target.is_file():
                return FileResponse(target)
            return FileResponse(settings.frontend_dist_dir / "index.html")

    return app


def _require_admin_token(configured_token: str, supplied_token: str) -> None:
    if not configured_token:
        raise HTTPException(status_code=503, detail="Admin API is disabled until ADMIN_TOKEN is configured.")
    if supplied_token != configured_token:
        raise HTTPException(status_code=401, detail="Invalid admin token.")


def _is_safe_child(base: Path, target: Path) -> bool:
    try:
        return target.is_relative_to(base)
    except AttributeError:
        return os.path.commonpath([str(base), str(target)]) == str(base)


app = create_app()
