from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def uuid_str() -> str:
    return str(uuid4())


class ScraperModule(Base):
    __tablename__ = "scraper_modules"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    capabilities: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ScraperRun(Base):
    __tablename__ = "scraper_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    module_key: Mapped[str] = mapped_column(ForeignKey("scraper_modules.key"), index=True)
    input: Mapped[dict] = mapped_column(JSONType)
    status: Mapped[str] = mapped_column(String(50), default="queued", index=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scheduled_for: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    total_raw_items: Mapped[int] = mapped_column(Integer, default=0)
    total_results: Mapped[int] = mapped_column(Integer, default=0)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ScraperRunAttempt(Base):
    __tablename__ = "scraper_run_attempts"
    __table_args__ = (UniqueConstraint("run_id", "attempt_number", name="scraper_run_attempts_run_attempt_unique"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(ForeignKey("scraper_runs.id", ondelete="CASCADE"), index=True)
    attempt_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(50), default="running", index=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class ScraperSchedule(Base):
    __tablename__ = "scraper_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    module_key: Mapped[str] = mapped_column(ForeignKey("scraper_modules.key"), index=True)
    input: Mapped[dict] = mapped_column(JSONType)
    cadence: Mapped[str] = mapped_column(String(50))
    timezone: Mapped[str] = mapped_column(String(100), default="America/Toronto")
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ScraperRawItem(Base):
    __tablename__ = "scraper_raw_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(ForeignKey("scraper_runs.id", ondelete="CASCADE"), index=True)
    module_key: Mapped[str] = mapped_column(ForeignKey("scraper_modules.key"), index=True)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    external_id: Mapped[Optional[str]] = mapped_column(String(512), nullable=True, index=True)
    raw_payload: Mapped[dict] = mapped_column(JSONType)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ScraperResult(Base):
    __tablename__ = "scraper_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(ForeignKey("scraper_runs.id", ondelete="CASCADE"), index=True)
    raw_item_id: Mapped[Optional[str]] = mapped_column(ForeignKey("scraper_raw_items.id", ondelete="SET NULL"), nullable=True)
    module_key: Mapped[str] = mapped_column(ForeignKey("scraper_modules.key"), index=True)
    module_record_table: Mapped[str] = mapped_column(String(255))
    module_record_id: Mapped[str] = mapped_column(String(36), index=True)
    external_id: Mapped[Optional[str]] = mapped_column(String(512), nullable=True, index=True)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sortable_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metrics: Mapped[dict] = mapped_column(JSONType, default=dict)
    details: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
