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
    browser_headless: bool = Field(default=True, validation_alias="SCRAPER_BROWSER_HEADLESS")
    browser_timeout_ms: int = Field(default=45000, validation_alias="SCRAPER_BROWSER_TIMEOUT_MS")
    worker_poll_seconds: int = Field(default=5, validation_alias="SCRAPER_WORKER_POLL_SECONDS")
    proxy_server: Optional[str] = Field(default=None, validation_alias="SCRAPER_PROXY_SERVER")
    proxy_username: Optional[str] = Field(default=None, validation_alias="SCRAPER_PROXY_USERNAME")
    proxy_password: Optional[str] = Field(default=None, validation_alias="SCRAPER_PROXY_PASSWORD")
    proxy_username_template: Optional[str] = Field(
        default=None, validation_alias="SCRAPER_PROXY_USERNAME_TEMPLATE"
    )


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str
    app_origin: str
    admin_token: str
    browser_headless: bool
    browser_timeout_ms: int
    worker_poll_seconds: int
    proxy_server: Optional[str]
    proxy_username: Optional[str]
    proxy_password: Optional[str]
    proxy_username_template: Optional[str]


@lru_cache
def get_settings() -> Settings:
    raw = RawSettings()

    return Settings(
        environment=raw.environment,
        database_url=_resolve_setting(raw.environment, "SCRAPER_DATABASE_URL", raw.database_url),
        app_origin=_resolve_setting(raw.environment, "SCRAPER_APP_ORIGIN", raw.app_origin),
        admin_token=_resolve_setting(raw.environment, "SCRAPER_ADMIN_TOKEN", raw.admin_token),
        browser_headless=raw.browser_headless,
        browser_timeout_ms=raw.browser_timeout_ms,
        worker_poll_seconds=max(raw.worker_poll_seconds, 1),
        proxy_server=_normalize_optional(raw.proxy_server),
        proxy_username=_normalize_optional(raw.proxy_username),
        proxy_password=_normalize_optional(raw.proxy_password),
        proxy_username_template=_normalize_optional(raw.proxy_username_template),
    )


def _normalize_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    stripped = value.strip()
    return stripped or None


def _resolve_setting(environment: str, name: str, value: Optional[str]) -> str:
    if value:
        return value

    if environment != "production" and name in LOCAL_DEV_DEFAULTS:
        return LOCAL_DEV_DEFAULTS[name]

    raise RuntimeError(f"{name} is not configured")
