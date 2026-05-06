from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models import JSONType, utcnow, uuid_str


class PageMetadataPage(Base):
    __tablename__ = "page_metadata_pages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    normalized_url: Mapped[str] = mapped_column(Text, unique=True, index=True)
    final_url: Mapped[str] = mapped_column(Text)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    h1: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    canonical_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    link_count: Mapped[int] = mapped_column(Integer, default=0)
    image_count: Mapped[int] = mapped_column(Integer, default=0)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class PageMetadataSnapshot(Base):
    __tablename__ = "page_metadata_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    page_id: Mapped[str] = mapped_column(ForeignKey("page_metadata_pages.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("scraper_runs.id", ondelete="CASCADE"), index=True)
    raw_item_id: Mapped[str] = mapped_column(ForeignKey("scraper_raw_items.id", ondelete="CASCADE"), index=True)
    request_url: Mapped[str] = mapped_column(Text)
    final_url: Mapped[str] = mapped_column(Text)
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    h1: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    canonical_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    link_count: Mapped[int] = mapped_column(Integer, default=0)
    image_count: Mapped[int] = mapped_column(Integer, default=0)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    raw_payload: Mapped[dict] = mapped_column(JSONType)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
