from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

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


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str
    app_origin: str
    admin_token: str


@lru_cache
def get_settings() -> Settings:
    raw = RawSettings()

    return Settings(
        environment=raw.environment,
        database_url=_resolve_setting(raw.environment, "SCRAPER_DATABASE_URL", raw.database_url),
        app_origin=_resolve_setting(raw.environment, "SCRAPER_APP_ORIGIN", raw.app_origin),
        admin_token=_resolve_setting(raw.environment, "SCRAPER_ADMIN_TOKEN", raw.admin_token),
    )


def _resolve_setting(environment: str, name: str, value: Optional[str]) -> str:
    if value:
        return value

    if environment != "production" and name in LOCAL_DEV_DEFAULTS:
        return LOCAL_DEV_DEFAULTS[name]

    raise RuntimeError(f"{name} is not configured")
