import os
import unittest
from typing import Dict, Optional
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

from app.config import get_settings
from app.dependencies import require_admin_token


def make_request(headers: Optional[Dict[str, str]] = None) -> Request:
    encoded_headers = [
        (key.lower().encode("latin-1"), value.encode("latin-1"))
        for key, value in (headers or {}).items()
    ]
    return Request({"type": "http", "headers": encoded_headers})


class SecurityGuardsTest(unittest.TestCase):
    def tearDown(self):
        get_settings.cache_clear()

    def test_require_admin_token_accepts_matching_token(self):
        with patch.dict(
            os.environ,
            {
                "SCRAPER_API_ENV": "development",
                "SCRAPER_DATABASE_URL": "sqlite+pysqlite:///:memory:",
                "SCRAPER_APP_ORIGIN": "http://127.0.0.1:3003",
                "SCRAPER_ADMIN_TOKEN": "test-token",
            },
            clear=True,
        ):
            get_settings.cache_clear()
            require_admin_token(make_request({"x-admin-token": "test-token"}))

    def test_require_admin_token_rejects_missing_token(self):
        with patch.dict(
            os.environ,
            {
                "SCRAPER_API_ENV": "development",
                "SCRAPER_DATABASE_URL": "sqlite+pysqlite:///:memory:",
                "SCRAPER_APP_ORIGIN": "http://127.0.0.1:3003",
                "SCRAPER_ADMIN_TOKEN": "test-token",
            },
            clear=True,
        ):
            get_settings.cache_clear()
            with self.assertRaises(HTTPException) as context:
                require_admin_token(make_request())

            self.assertEqual(context.exception.status_code, 401)

    def test_get_settings_requires_admin_token_even_in_development(self):
        with patch.dict(
            os.environ,
            {
                "SCRAPER_API_ENV": "development",
                "SCRAPER_DATABASE_URL": "sqlite+pysqlite:///:memory:",
                "SCRAPER_APP_ORIGIN": "http://127.0.0.1:3003",
            },
            clear=True,
        ):
            get_settings.cache_clear()
            with self.assertRaises(RuntimeError) as context:
                get_settings()

            self.assertIn("SCRAPER_ADMIN_TOKEN", str(context.exception))


if __name__ == "__main__":
    unittest.main()
