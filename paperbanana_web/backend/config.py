from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    database_path: Path
    results_dir: Path
    frontend_dist_dir: Path
    admin_token: str
    allow_mock_generation: bool
    max_candidates: int
    max_critic_rounds: int
    cors_origins: list[str]


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def get_settings() -> Settings:
    data_dir = Path(os.getenv("PAPERBANANA_WEB_DATA_DIR", PROJECT_ROOT / "paperbanana_web_data")).resolve()
    results_dir = data_dir / "results"
    frontend_dist_dir = Path(os.getenv("PAPERBANANA_FRONTEND_DIST", PROJECT_ROOT / "web-client" / "dist")).resolve()
    cors_origins = _split_csv(os.getenv("PAPERBANANA_CORS_ORIGINS", "*"))

    return Settings(
        data_dir=data_dir,
        database_path=Path(os.getenv("PAPERBANANA_DB_PATH", data_dir / "paperbanana.sqlite3")).resolve(),
        results_dir=results_dir.resolve(),
        frontend_dist_dir=frontend_dist_dir,
        admin_token=os.getenv("ADMIN_TOKEN", ""),
        allow_mock_generation=os.getenv("PAPERBANANA_ALLOW_MOCK", "0") == "1",
        max_candidates=max(1, int(os.getenv("PAPERBANANA_MAX_CANDIDATES", "4"))),
        max_critic_rounds=max(0, int(os.getenv("PAPERBANANA_MAX_CRITIC_ROUNDS", "3"))),
        cors_origins=cors_origins,
    )
