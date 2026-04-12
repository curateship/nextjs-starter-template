from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def uuid_str() -> str:
    return str(uuid4())


class ScraperModule(Base):
    __tablename__ = "scraper_modules"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ScraperRun(Base):
    __tablename__ = "scraper_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    module_key: Mapped[str] = mapped_column(ForeignKey("scraper_modules.key"), index=True)
    keyword: Mapped[str] = mapped_column(String(255), index=True)
    area: Mapped[str] = mapped_column(String(255), index=True)
    max_places: Mapped[int] = mapped_column(Integer, default=100)
    scheduled_for: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(50), default="queued", index=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cancel_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    total_places_found: Mapped[int] = mapped_column(Integer, default=0)
    total_places_saved: Mapped[int] = mapped_column(Integer, default=0)
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
    status: Mapped[str] = mapped_column(String(50), default="running")
    proxy_session_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    browser_session_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class ScraperSchedule(Base):
    __tablename__ = "scraper_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    module_key: Mapped[str] = mapped_column(ForeignKey("scraper_modules.key"), index=True)
    keyword: Mapped[str] = mapped_column(String(255), index=True)
    area: Mapped[str] = mapped_column(String(255), index=True)
    max_places: Mapped[int] = mapped_column(Integer, default=100)
    cadence: Mapped[str] = mapped_column(String(50))
    timezone: Mapped[str] = mapped_column(String(100), default="America/Toronto")
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ScraperPlace(Base):
    __tablename__ = "scraper_places"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    external_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    normalized_google_maps_url: Mapped[str] = mapped_column(String(1024), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    primary_category: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    google_maps_url: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ScraperPlaceSnapshot(Base):
    __tablename__ = "scraper_place_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    place_id: Mapped[str] = mapped_column(ForeignKey("scraper_places.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("scraper_runs.id", ondelete="CASCADE"), index=True)
    rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    review_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hours_text: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)
    raw_payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    scraped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ScraperRunResult(Base):
    __tablename__ = "scraper_run_results"
    __table_args__ = (UniqueConstraint("run_id", "position", name="scraper_run_results_run_position_unique"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(ForeignKey("scraper_runs.id", ondelete="CASCADE"), index=True)
    place_id: Mapped[str] = mapped_column(ForeignKey("scraper_places.id", ondelete="CASCADE"), index=True)
    snapshot_id: Mapped[str] = mapped_column(
        ForeignKey("scraper_place_snapshots.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
