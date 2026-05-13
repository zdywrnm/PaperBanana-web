from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


Provider = Literal["openrouter", "gemini", "openai", "bailian"]
TaskName = Literal["diagram", "plot"]
PipelineMode = Literal["demo_full", "demo_planner_critic", "vanilla"]
RetrievalSetting = Literal["auto", "manual", "random", "none"]
AspectRatio = Literal["21:9", "16:9", "3:2", "1:1"]


class ApiKeys(BaseModel):
    openrouter: str = ""
    gemini: str = ""
    openai: str = ""
    bailian: str = ""


class GenerateJobRequest(BaseModel):
    provider: Provider
    api_keys: ApiKeys = Field(default_factory=ApiKeys)
    task_name: TaskName = "diagram"
    method_content: str = Field(min_length=20, max_length=80000)
    caption: str = Field(min_length=3, max_length=4000)
    main_model_name: str = Field(min_length=1, max_length=200)
    image_gen_model_name: str = Field(min_length=1, max_length=200)
    pipeline_mode: PipelineMode = "demo_planner_critic"
    retrieval_setting: RetrievalSetting = "none"
    aspect_ratio: AspectRatio = "16:9"
    num_candidates: int = Field(default=1, ge=1, le=20)
    max_critic_rounds: int = Field(default=1, ge=0, le=5)
    mock: bool = False

    @field_validator("method_content", "caption")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("main_model_name", "image_gen_model_name")
    @classmethod
    def strip_model(cls, value: str) -> str:
        return value.strip()


class ResultImage(BaseModel):
    candidate_id: int
    filename: str
    url: str


class JobResponse(BaseModel):
    id: str
    status: str
    provider: str
    task_name: str
    main_model_name: str
    image_gen_model_name: str
    pipeline_mode: str
    retrieval_setting: str
    aspect_ratio: str
    num_candidates: int
    max_critic_rounds: int
    method_content: str | None = None
    caption: str | None = None
    prompt_char_count: int
    result_images: list[ResultImage] = Field(default_factory=list)
    error: str | None = None
    logs_tail: str = ""
    created_at: str
    updated_at: str
    started_at: str | None = None
    completed_at: str | None = None


class CreateJobResponse(BaseModel):
    id: str
    status: str


class AdminJobListResponse(BaseModel):
    jobs: list[JobResponse]
