import os
import tempfile
import unittest
from unittest.mock import patch

from app.config import get_settings
from app.db import Base, get_engine, get_session_factory
from app.models import (
    CustomShellFeedback,
    CustomShellFeedbackVote,
    CustomShellMedia,
    CustomShellSession,
    CustomShellSettings,
    CustomShellUser,
)
from app.routes.auth import _login_failures
from app.security import hash_password

APP_ORIGIN = "http://127.0.0.1:3002"


class DatabaseTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db.close()
        self.env_patch = patch.dict(
            os.environ,
            {
                "CUSTOM_SHELL_API_ENV": "development",
                "CUSTOM_SHELL_DATABASE_URL": f"sqlite:///{self.temp_db.name}",
                "CUSTOM_SHELL_APP_ORIGINS": "http://127.0.0.1:3002,http://localhost:3002",
                "CUSTOM_SHELL_R2_ACCOUNT_ID": "test-account",
                "CUSTOM_SHELL_R2_ACCESS_KEY_ID": "test-key",
                "CUSTOM_SHELL_R2_SECRET_ACCESS_KEY": "test-secret",
                "CUSTOM_SHELL_R2_BUCKET_NAME": "test-bucket",
            },
            clear=True,
        )
        self.env_patch.start()
        reset_settings()
        _login_failures.clear()
        Base.metadata.create_all(bind=get_engine())
        clear_settings()

    def tearDown(self):
        clear_settings()
        _login_failures.clear()
        reset_settings()
        self.env_patch.stop()
        os.unlink(self.temp_db.name)


def reset_settings() -> None:
    if get_engine.cache_info().currsize:
        get_engine().dispose()
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()


def clear_settings() -> None:
    db = get_session_factory()()
    try:
        db.query(CustomShellFeedbackVote).delete()
        db.query(CustomShellFeedback).delete()
        db.query(CustomShellMedia).delete()
        db.query(CustomShellSession).delete()
        db.query(CustomShellUser).delete()
        db.query(CustomShellSettings).delete()
        db.commit()
    finally:
        db.close()


def create_user(email: str = "tyler@internal.dev", password: str = "password123") -> CustomShellUser:
    db = get_session_factory()()
    try:
        user = CustomShellUser(
            email=email,
            name="Tyler",
            role="admin",
            password_hash=hash_password(password),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def login_client(client, email: str = "tyler@internal.dev", password: str = "password123"):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"Origin": APP_ORIGIN},
    )
