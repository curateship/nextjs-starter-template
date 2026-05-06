from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ModuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    name: str
    description: str
    enabled: bool
    capabilities: dict


class ModuleListOut(BaseModel):
    modules: list[ModuleOut]


class RunCreateIn(BaseModel):
    module_key: str
    input: dict = Field(default_factory=dict)


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    module_key: str
    input: dict
    status: str
    error_message: Optional[str]
    scheduled_for: Optional[datetime]
    total_raw_items: int
    total_results: int
    attempt_count: int
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]


class RunListOut(BaseModel):
    runs: list[RunOut]


class RunResponseOut(BaseModel):
    run: RunOut


class ResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    run_id: str
    raw_item_id: Optional[str]
    module_key: str
    module_record_table: str
    module_record_id: str
    external_id: Optional[str]
    source_url: Optional[str]
    title: Optional[str]
    summary: Optional[str]
    sortable_text: Optional[str]
    metrics: dict
    details: dict
    created_at: datetime


class RunResultsOut(BaseModel):
    results: list[ResultOut]


class ScheduleCreateIn(BaseModel):
    module_key: str
    input: dict = Field(default_factory=dict)
    cadence: Literal["daily", "weekly", "monthly"]
    timezone: str = Field(min_length=1)


class ScheduleUpdateIn(BaseModel):
    input: Optional[dict] = None
    cadence: Optional[Literal["daily", "weekly", "monthly"]] = None
    timezone: Optional[str] = None
    active: Optional[bool] = None


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    module_key: str
    input: dict
    cadence: str
    timezone: str
    active: bool
    next_run_at: datetime
    last_run_at: Optional[datetime]
    created_at: datetime


class ScheduleListOut(BaseModel):
    schedules: list[ScheduleOut]


class ScheduleResponseOut(BaseModel):
    schedule: ScheduleOut
