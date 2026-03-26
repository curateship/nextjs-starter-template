from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


LOCAL_DEV_DEFAULTS = {
    "SEO_DATABASE_URL": "postgresql+psycopg://postgres:localdev@localhost:54320/whateverseo_seo",
    "SEO_APP_ORIGIN": "http://127.0.0.1:5173",
    "HUB_APP_ORIGIN": "http://localhost:3000",
    "HUB_SEO_REDEEM_URL": "http://localhost:3000/api/seo/redeem",
    "HUB_SEO_ACCESS_URL": "http://localhost:3000/api/seo/access",
}


class RawSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development", validation_alias="SEO_API_ENV")
    database_url: Optional[str] = Field(default=None, validation_alias="SEO_DATABASE_URL")
    session_secret: Optional[str] = Field(default=None, validation_alias="SEO_SESSION_SECRET")
    internal_api_token: Optional[str] = Field(default=None, validation_alias="SEO_INTERNAL_API_TOKEN")
    seo_app_origin: Optional[str] = Field(default=None, validation_alias="SEO_APP_ORIGIN")
    hub_app_origin: Optional[str] = Field(default=None, validation_alias="HUB_APP_ORIGIN")
    hub_redeem_url: Optional[str] = Field(default=None, validation_alias="HUB_SEO_REDEEM_URL")
    hub_access_url: Optional[str] = Field(default=None, validation_alias="HUB_SEO_ACCESS_URL")
    session_ttl_hours: int = Field(default=12, validation_alias="SEO_SESSION_TTL_HOURS")


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str
    session_secret: str
    internal_api_token: str
    seo_app_origin: str
    hub_app_origin: str
    hub_redeem_url: str
    hub_access_url: str
    session_ttl_hours: int


@lru_cache
def get_settings() -> Settings:
    raw = RawSettings()

    return Settings(
        environment=raw.environment,
        database_url=_resolve_setting(raw.environment, "SEO_DATABASE_URL", raw.database_url),
        session_secret=_require_setting("SEO_SESSION_SECRET", raw.session_secret),
        internal_api_token=_require_setting("SEO_INTERNAL_API_TOKEN", raw.internal_api_token),
        seo_app_origin=_resolve_setting(raw.environment, "SEO_APP_ORIGIN", raw.seo_app_origin),
        hub_app_origin=_resolve_setting(raw.environment, "HUB_APP_ORIGIN", raw.hub_app_origin),
        hub_redeem_url=_resolve_setting(raw.environment, "HUB_SEO_REDEEM_URL", raw.hub_redeem_url),
        hub_access_url=_resolve_setting(raw.environment, "HUB_SEO_ACCESS_URL", raw.hub_access_url),
        session_ttl_hours=raw.session_ttl_hours,
    )


def _resolve_setting(environment: str, name: str, value: Optional[str]) -> str:
    if value:
        return value

    if environment != "production" and name in LOCAL_DEV_DEFAULTS:
        return LOCAL_DEV_DEFAULTS[name]

    raise RuntimeError(f"{name} is not configured")


def _require_setting(name: str, value: Optional[str]) -> str:
    if value:
        return value

    raise RuntimeError(f"{name} is not configured")
