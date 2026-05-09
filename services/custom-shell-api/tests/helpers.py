import os
import unittest
from unittest.mock import patch

from app.config import get_settings
from app.db import get_engine, get_session_factory
from app.models import CustomShellSettings


class DatabaseTestCase(unittest.TestCase):
    def setUp(self):
        self.env_patch = patch.dict(
            os.environ,
            {
                "CUSTOM_SHELL_API_ENV": "development",
                "CUSTOM_SHELL_DATABASE_URL": "postgresql+psycopg://postgres:localdev@localhost:54320/postgres",
                "CUSTOM_SHELL_APP_ORIGINS": "http://127.0.0.1:3002,http://localhost:3002",
            },
            clear=True,
        )
        self.env_patch.start()
        reset_settings()
        CustomShellSettings.metadata.create_all(bind=get_engine())
        clear_settings()

    def tearDown(self):
        clear_settings()
        reset_settings()
        self.env_patch.stop()


def reset_settings() -> None:
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()


def clear_settings() -> None:
    db = get_session_factory()()
    try:
        db.query(CustomShellSettings).delete()
        db.commit()
    finally:
        db.close()
