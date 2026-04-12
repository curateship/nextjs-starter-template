from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class RunCreateIn(BaseModel):
    keyword: str
    area: str
    max_places: int = Field(default=100, ge=1, le=250)


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    module_key: str
    keyword: str
    area: str
    max_places: int
    scheduled_for: Optional[datetime]
    status: str
    error_message: Optional[str]
    cancel_requested_at: Optional[datetime]
    total_places_found: int
    total_places_saved: int
    attempt_count: int
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]


class RunListOut(BaseModel):
    runs: list[RunOut]


class RunResponseOut(BaseModel):
    run: RunOut


class PlaceOut(BaseModel):
    id: str
    external_id: str
    name: str
    primary_category: Optional[str]
    address: Optional[str]
    phone: Optional[str]
    website: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    google_maps_url: str


class PlaceSnapshotOut(BaseModel):
    id: str
    rating: Optional[float]
    review_count: Optional[int]
    hours_text: Optional[list[str]]
    scraped_at: datetime


class RunResultOut(BaseModel):
    id: str
    position: int
    place: PlaceOut
    snapshot: PlaceSnapshotOut


class RunResultsOut(BaseModel):
    results: list[RunResultOut]


class ScheduleCreateIn(BaseModel):
    keyword: str
    area: str
    max_places: int = Field(default=100, ge=1, le=250)
    cadence: Literal["daily", "weekly", "monthly"]
    timezone: str = Field(min_length=1)


class ScheduleUpdateIn(BaseModel):
    keyword: Optional[str] = None
    area: Optional[str] = None
    max_places: Optional[int] = Field(default=None, ge=1, le=250)
    cadence: Optional[Literal["daily", "weekly", "monthly"]] = None
    timezone: Optional[str] = None
    active: Optional[bool] = None


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    module_key: str
    keyword: str
    area: str
    max_places: int
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
