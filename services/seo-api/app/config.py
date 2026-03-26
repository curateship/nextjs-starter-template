from functools import lru_cache
import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    hub_sso_secret: str
    session_secret: str
    internal_api_token: str
    seo_app_origin: str
    session_ttl_hours: int = 12


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=_read_env("SEO_DATABASE_URL"),
        hub_sso_secret=_read_env("SEO_HUB_SSO_SECRET"),
        session_secret=_read_env("SEO_SESSION_SECRET"),
        internal_api_token=_read_env("SEO_INTERNAL_API_TOKEN"),
        seo_app_origin=_read_env("SEO_APP_ORIGIN"),
    )


def _read_env(name: str) -> str:
    value = os.getenv(name)
    if value:
        return value

    if name == "SEO_DATABASE_URL":
        return "postgresql+psycopg://postgres:localdev@localhost:54320/whateverseo_seo"
    if name == "SEO_HUB_SSO_SECRET":
        return "dev-seo-sso-secret"
    if name == "SEO_SESSION_SECRET":
        return "dev-seo-session-secret"
    if name == "SEO_INTERNAL_API_TOKEN":
        return "dev-seo-internal-token"
    if name == "SEO_APP_ORIGIN":
        return "http://localhost:5173"

    return value
