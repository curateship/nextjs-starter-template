from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def uuid_str() -> str:
    return str(uuid4())


class SeoUser(Base):
    __tablename__ = "seo_users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    hub_user_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    role: Mapped[str] = mapped_column(String(50), default="end_user")
    seo_access: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class SeoWorkspace(Base):
    __tablename__ = "seo_workspaces"
    __table_args__ = (UniqueConstraint("owner_user_id", "name", name="seo_workspace_owner_name_unique"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("seo_users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class SeoKeywordRun(Base):
    __tablename__ = "seo_keyword_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("seo_workspaces.id", ondelete="CASCADE"), index=True)
    seo_user_id: Mapped[str] = mapped_column(ForeignKey("seo_users.id", ondelete="CASCADE"), index=True)
    seed_keyword: Mapped[str] = mapped_column(String(255), index=True)
    location: Mapped[str] = mapped_column(String(100), default="United States")
    language: Mapped[str] = mapped_column(String(50), default="en")
    max_results: Mapped[int] = mapped_column(Integer, default=100)
    force_refresh: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(50), default="queued")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SeoKeyword(Base):
    __tablename__ = "seo_keywords"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    keyword: Mapped[str] = mapped_column(String(255))
    normalized_keyword: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SeoKeywordMetric(Base):
    __tablename__ = "seo_keyword_metrics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    keyword_id: Mapped[str] = mapped_column(ForeignKey("seo_keywords.id", ondelete="CASCADE"), index=True)
    location: Mapped[str] = mapped_column(String(100), default="United States")
    language: Mapped[str] = mapped_column(String(50), default="en")
    search_volume: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    competition: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    cpc: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    keyword_difficulty: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    provider_payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class SeoRunResult(Base):
    __tablename__ = "seo_run_results"
    __table_args__ = (UniqueConstraint("run_id", "keyword_metric_id", name="seo_run_results_unique"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    run_id: Mapped[str] = mapped_column(ForeignKey("seo_keyword_runs.id", ondelete="CASCADE"), index=True)
    keyword_id: Mapped[str] = mapped_column(ForeignKey("seo_keywords.id", ondelete="CASCADE"), index=True)
    keyword_metric_id: Mapped[str] = mapped_column(ForeignKey("seo_keyword_metrics.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SeoUsageEvent(Base):
    __tablename__ = "seo_usage_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    seo_user_id: Mapped[str] = mapped_column(ForeignKey("seo_users.id", ondelete="CASCADE"), index=True)
    workspace_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("seo_workspaces.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(100), index=True)
    payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
