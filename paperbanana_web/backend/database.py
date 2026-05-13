from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobStore:
    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.init()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.database_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def init(self) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    task_name TEXT NOT NULL,
                    main_model_name TEXT NOT NULL,
                    image_gen_model_name TEXT NOT NULL,
                    pipeline_mode TEXT NOT NULL,
                    retrieval_setting TEXT NOT NULL,
                    aspect_ratio TEXT NOT NULL,
                    num_candidates INTEGER NOT NULL,
                    max_critic_rounds INTEGER NOT NULL,
                    method_content TEXT NOT NULL,
                    caption TEXT NOT NULL,
                    prompt_char_count INTEGER NOT NULL,
                    client_ip TEXT,
                    user_agent TEXT,
                    result_images_json TEXT NOT NULL DEFAULT '[]',
                    logs TEXT NOT NULL DEFAULT '',
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")

    def create_job(self, record: dict[str, Any]) -> None:
        now = utc_now()
        payload = {
            **record,
            "status": "queued",
            "result_images_json": "[]",
            "logs": "",
            "error": None,
            "created_at": now,
            "updated_at": now,
            "started_at": None,
            "completed_at": None,
        }
        columns = ", ".join(payload.keys())
        placeholders = ", ".join([f":{key}" for key in payload])
        with self.connect() as conn:
            conn.execute(f"INSERT INTO jobs ({columns}) VALUES ({placeholders})", payload)

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

    def list_jobs(self, limit: int = 100) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def mark_running(self, job_id: str) -> None:
        now = utc_now()
        self.update_job(job_id, status="running", started_at=now, updated_at=now)

    def mark_succeeded(self, job_id: str, result_images: list[dict[str, Any]], logs: str) -> None:
        now = utc_now()
        self.update_job(
            job_id,
            status="succeeded",
            result_images_json=json.dumps(result_images, ensure_ascii=False),
            logs=logs,
            updated_at=now,
            completed_at=now,
        )

    def mark_failed(self, job_id: str, error: str, logs: str = "") -> None:
        now = utc_now()
        self.update_job(
            job_id,
            status="failed",
            error=error[:4000],
            logs=logs,
            updated_at=now,
            completed_at=now,
        )

    def append_logs(self, job_id: str, chunk: str) -> None:
        if not chunk:
            return
        with self.connect() as conn:
            row = conn.execute("SELECT logs FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if not row:
                return
            logs = ((row["logs"] or "") + chunk)[-20000:]
            conn.execute(
                "UPDATE jobs SET logs = ?, updated_at = ? WHERE id = ?",
                (logs, utc_now(), job_id),
            )

    def update_job(self, job_id: str, **fields: Any) -> None:
        if not fields:
            return
        assignments = ", ".join([f"{key} = :{key}" for key in fields])
        with self.connect() as conn:
            conn.execute(
                f"UPDATE jobs SET {assignments} WHERE id = :job_id",
                {**fields, "job_id": job_id},
            )
