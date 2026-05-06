from dataclasses import dataclass
from functools import lru_cache
from typing import Optional, Tuple

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


LOCAL_DEV_DEFAULTS = {
    "SCRAPER_DATABASE_URL": "postgresql+psycopg://postgres:localdev@localhost:54320/whateverscraper",
    "SCRAPER_APP_ORIGIN": "http://127.0.0.1:3003",
}


class RawSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development", validation_alias="SCRAPER_API_ENV")
    database_url: Optional[str] = Field(default=None, validation_alias="SCRAPER_DATABASE_URL")
    app_origin: Optional[str] = Field(default=None, validation_alias="SCRAPER_APP_ORIGIN")
    admin_token: Optional[str] = Field(default=None, validation_alias="SCRAPER_ADMIN_TOKEN")
    worker_poll_seconds: int = Field(default=5, validation_alias="SCRAPER_WORKER_POLL_SECONDS")


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str
    app_origin: str
    app_origins: Tuple[str, ...]
    admin_token: str
    worker_poll_seconds: int


@lru_cache
def get_settings() -> Settings:
    raw = RawSettings()
    app_origin = _resolve_setting(raw.environment, "SCRAPER_APP_ORIGIN", raw.app_origin)

    return Settings(
        environment=raw.environment,
        database_url=_resolve_setting(raw.environment, "SCRAPER_DATABASE_URL", raw.database_url),
        app_origin=app_origin,
        app_origins=_resolve_app_origins(raw.environment, app_origin),
        admin_token=_resolve_setting(raw.environment, "SCRAPER_ADMIN_TOKEN", raw.admin_token),
        worker_poll_seconds=max(raw.worker_poll_seconds, 1),
    )


def _resolve_setting(environment: str, name: str, value: Optional[str]) -> str:
    if value:
        return value

    if environment != "production" and name in LOCAL_DEV_DEFAULTS:
        return LOCAL_DEV_DEFAULTS[name]

    raise RuntimeError(f"{name} is not configured")


def _resolve_app_origins(environment: str, value: str) -> Tuple[str, ...]:
    origins = {origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()}

    if environment != "production":
        origins.update({"http://127.0.0.1:3003", "http://localhost:3003"})

    return tuple(sorted(origins))
