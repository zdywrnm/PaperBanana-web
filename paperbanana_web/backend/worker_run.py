from __future__ import annotations

import argparse
import asyncio
import base64
import json
import sys
from io import BytesIO
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))


def extract_final_image_b64(result: dict[str, Any], task_name: str, exp_mode: str, max_rounds: int) -> str | None:
    for round_idx in range(max_rounds, -1, -1):
        key = f"target_{task_name}_critic_desc{round_idx}_base64_jpg"
        if result.get(key):
            return result[key]

    if exp_mode == "demo_full":
        key = f"target_{task_name}_stylist_desc0_base64_jpg"
    elif exp_mode == "vanilla":
        key = f"vanilla_{task_name}_base64_jpg"
    else:
        key = f"target_{task_name}_desc0_base64_jpg"
    return result.get(key)


def write_image_from_b64(b64: str, output_path: Path) -> None:
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    image_data = base64.b64decode(b64)

    from PIL import Image

    img = Image.open(BytesIO(image_data))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(output_path), format="PNG")


def write_mock_images(spec: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    images = []
    for idx in range(spec["num_candidates"]):
        filename = f"candidate_{idx}.svg"
        target = output_dir / filename
        caption = spec["caption"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        provider = spec["provider"]
        target.write_text(
            f"""<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f8fafc"/>
  <rect x="70" y="70" width="1140" height="580" rx="24" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
  <text x="110" y="145" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="700" fill="#111827">PaperBanana Mock Result</text>
  <text x="110" y="205" font-family="Inter, Arial, sans-serif" font-size="22" fill="#475569">Provider: {provider} · Candidate {idx + 1}</text>
  <text x="110" y="285" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="600" fill="#111827">Caption</text>
  <foreignObject x="110" y="310" width="980" height="220">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font: 22px Inter, Arial, sans-serif; color: #334155; line-height: 1.45;">{caption}</div>
  </foreignObject>
  <path d="M160 555 H1120" stroke="#f97316" stroke-width="8" stroke-linecap="round"/>
  <circle cx="290" cy="555" r="34" fill="#f97316"/>
  <circle cx="640" cy="555" r="34" fill="#2563eb"/>
  <circle cx="990" cy="555" r="34" fill="#16a34a"/>
</svg>
""",
            encoding="utf-8",
        )
        images.append({"candidate_id": idx, "filename": filename})
    return {"images": images, "raw_results_path": None}


async def run_pipeline(spec: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    task_name = spec["task_name"]
    exp_mode = spec["pipeline_mode"]

    from agents.critic_agent import CriticAgent
    from agents.planner_agent import PlannerAgent
    from agents.polish_agent import PolishAgent
    from agents.retriever_agent import RetrieverAgent
    from agents.stylist_agent import StylistAgent
    from agents.vanilla_agent import VanillaAgent
    from agents.visualizer_agent import VisualizerAgent
    from utils import config
    from utils.paperviz_processor import PaperVizProcessor

    exp_config = config.ExpConfig(
        dataset_name="Demo",
        task_name=task_name,
        split_name="demo",
        exp_mode=exp_mode,
        retrieval_setting=spec["retrieval_setting"],
        max_critic_rounds=spec["max_critic_rounds"],
        main_model_name=spec["main_model_name"],
        image_gen_model_name=spec["image_gen_model_name"],
        work_dir=PROJECT_ROOT,
    )

    processor = PaperVizProcessor(
        exp_config=exp_config,
        vanilla_agent=VanillaAgent(exp_config=exp_config),
        planner_agent=PlannerAgent(exp_config=exp_config),
        visualizer_agent=VisualizerAgent(exp_config=exp_config),
        stylist_agent=StylistAgent(exp_config=exp_config),
        critic_agent=CriticAgent(exp_config=exp_config),
        retriever_agent=RetrieverAgent(exp_config=exp_config),
        polish_agent=PolishAgent(exp_config=exp_config),
    )

    data_list = []
    for idx in range(spec["num_candidates"]):
        data_list.append(
            {
                "filename": f"web_candidate_{idx}",
                "caption": spec["caption"],
                "content": spec["method_content"],
                "visual_intent": spec["caption"],
                "additional_info": {"rounded_ratio": spec["aspect_ratio"]},
                "max_critic_rounds": spec["max_critic_rounds"],
                "candidate_id": idx,
            }
        )

    raw_results = []
    async for result_data in processor.process_queries_batch(
        data_list,
        max_concurrent=spec["num_candidates"],
        do_eval=False,
    ):
        raw_results.append(result_data)

    output_dir.mkdir(parents=True, exist_ok=True)
    raw_results_path = output_dir / "results.json"
    raw_results_path.write_text(json.dumps(raw_results, ensure_ascii=False, indent=2), encoding="utf-8")

    images = []
    for idx, result in enumerate(raw_results):
        b64 = extract_final_image_b64(result, task_name, exp_mode, spec["max_critic_rounds"])
        if not b64 or b64 == "Error":
            print(f"WARNING: no final image for candidate {idx}", file=sys.stderr)
            continue
        filename = f"candidate_{idx}.png"
        write_image_from_b64(b64, output_dir / filename)
        images.append({"candidate_id": idx, "filename": filename})

    if not images:
        raise RuntimeError("Pipeline completed but did not produce any image.")

    return {"images": images, "raw_results_path": str(raw_results_path)}


async def main() -> int:
    parser = argparse.ArgumentParser(description="Run one PaperBanana web job in an isolated process.")
    parser.add_argument("--spec", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--mock", action="store_true")
    args = parser.parse_args()

    spec_path = Path(args.spec)
    output_dir = Path(args.out)
    spec = json.loads(spec_path.read_text(encoding="utf-8"))

    if args.mock:
        result = write_mock_images(spec, output_dir)
    else:
        result = await run_pipeline(spec, output_dir)

    (output_dir / "job-output.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
