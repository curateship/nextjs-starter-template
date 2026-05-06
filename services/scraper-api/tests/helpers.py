import os
import tempfile
import unittest
from unittest.mock import patch

from app.config import get_settings
from app.db import Base, get_engine, get_session_factory
from app.modules.registry import seed_modules


class DatabaseTestCase(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        database_url = f"sqlite+pysqlite:///{self.tempdir.name}/scraper-test.db"
        self.env_patch = patch.dict(
            os.environ,
            {
                "SCRAPER_API_ENV": "development",
                "SCRAPER_DATABASE_URL": database_url,
                "SCRAPER_APP_ORIGIN": "http://127.0.0.1:3003",
                "SCRAPER_ADMIN_TOKEN": "test-token",
            },
            clear=True,
        )
        self.env_patch.start()
        reset_settings()
        Base.metadata.create_all(bind=get_engine())
        db = get_session_factory()()
        try:
            seed_modules(db)
        finally:
            db.close()

    def tearDown(self):
        reset_settings()
        self.env_patch.stop()
        self.tempdir.cleanup()


def reset_settings() -> None:
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()
