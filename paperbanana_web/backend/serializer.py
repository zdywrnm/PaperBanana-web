from __future__ import annotations

import json
from typing import Any


def job_to_response(row: dict[str, Any], include_prompt: bool = True) -> dict[str, Any]:
    result_images = json.loads(row.get("result_images_json") or "[]")
    logs = row.get("logs") or ""
    return {
        "id": row["id"],
        "status": row["status"],
        "provider": row["provider"],
        "task_name": row["task_name"],
        "main_model_name": row["main_model_name"],
        "image_gen_model_name": row["image_gen_model_name"],
        "pipeline_mode": row["pipeline_mode"],
        "retrieval_setting": row["retrieval_setting"],
        "aspect_ratio": row["aspect_ratio"],
        "num_candidates": row["num_candidates"],
        "max_critic_rounds": row["max_critic_rounds"],
        "method_content": row["method_content"] if include_prompt else None,
        "caption": row["caption"] if include_prompt else None,
        "infographic_category": row.get("infographic_category") or "方法框架图",
        "prompt_char_count": row["prompt_char_count"],
        "result_images": result_images,
        "error": row.get("error"),
        "logs_tail": logs[-3000:],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "started_at": row.get("started_at"),
        "completed_at": row.get("completed_at"),
    }
