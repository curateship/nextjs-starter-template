from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


LOCAL_DEV_DEFAULTS = {
    "CUSTOM_SHELL_DATABASE_URL": "postgresql+psycopg://postgres:localdev@localhost:54320/postgres",
    "CUSTOM_SHELL_APP_ORIGINS": "http://127.0.0.1:3002,http://localhost:3002",
}


class RawSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development", validation_alias="CUSTOM_SHELL_API_ENV")
    database_url: Optional[str] = Field(default=None, validation_alias="CUSTOM_SHELL_DATABASE_URL")
    app_origins: Optional[str] = Field(default=None, validation_alias="CUSTOM_SHELL_APP_ORIGINS")
    session_ttl_hours: int = Field(default=12, validation_alias="CUSTOM_SHELL_SESSION_TTL_HOURS")


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str
    app_origins: tuple[str, ...]
    session_ttl_hours: int


@lru_cache
def get_settings() -> Settings:
    raw = RawSettings()
    app_origins = _resolve_setting(
        raw.environment,
        "CUSTOM_SHELL_APP_ORIGINS",
        raw.app_origins,
    )

    return Settings(
        environment=raw.environment,
        database_url=_resolve_setting(
            raw.environment,
            "CUSTOM_SHELL_DATABASE_URL",
            raw.database_url,
        ),
        app_origins=_resolve_app_origins(raw.environment, app_origins),
        session_ttl_hours=raw.session_ttl_hours,
    )


def _resolve_setting(environment: str, name: str, value: Optional[str]) -> str:
    if value:
        return value

    if environment != "production" and name in LOCAL_DEV_DEFAULTS:
        return LOCAL_DEV_DEFAULTS[name]

    raise RuntimeError(f"{name} is not configured")


def _resolve_app_origins(environment: str, value: str) -> tuple[str, ...]:
    origins = {origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()}

    if environment != "production":
        origins.update({"http://127.0.0.1:3002", "http://localhost:3002"})

    return tuple(sorted(origins))
