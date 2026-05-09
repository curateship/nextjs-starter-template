from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CustomShellSettings(Base):
    __tablename__ = "custom_shell_settings"
    __table_args__ = (
        CheckConstraint("key = 'default'", name="custom_shell_settings_default_key"),
    )

    key: Mapped[str] = mapped_column(Text, primary_key=True, default="default")
    settings: Mapped[dict] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
