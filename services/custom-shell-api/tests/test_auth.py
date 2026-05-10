from datetime import timedelta
import unittest

from fastapi.testclient import TestClient

from app.db import get_session_factory
from app.main import create_app
from app.models import CustomShellSession, utcnow
from app.security import SESSION_COOKIE_NAME

from helpers import APP_ORIGIN, DatabaseTestCase, create_user, login_client


class AuthApiTest(DatabaseTestCase):
    def test_login_with_valid_credentials_creates_session_cookie(self):
        create_user()

        with TestClient(create_app()) as client:
            response = login_client(client)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["email"], "tyler@internal.dev")
        self.assertIn(SESSION_COOKIE_NAME, response.cookies)

        db = get_session_factory()()
        try:
            sessions = db.query(CustomShellSession).all()
            self.assertEqual(len(sessions), 1)
            self.assertEqual(len(sessions[0].token_hash), 64)
            self.assertNotEqual(sessions[0].token_hash, response.cookies[SESSION_COOKIE_NAME])
        finally:
            db.close()

    def test_login_with_invalid_credentials_returns_401(self):
        create_user()

        with TestClient(create_app()) as client:
            response = login_client(client, password="wrong")

        self.assertEqual(response.status_code, 401)
        self.assertNotIn(SESSION_COOKIE_NAME, response.cookies)

    def test_login_rate_limits_repeated_invalid_attempts(self):
        create_user()

        with TestClient(create_app()) as client:
            for _ in range(5):
                response = login_client(client, password="wrong")
                self.assertEqual(response.status_code, 401)

            response = login_client(client, password="wrong")

        self.assertEqual(response.status_code, 429)

    def test_successful_login_clears_failed_attempts(self):
        create_user()

        with TestClient(create_app()) as client:
            for _ in range(4):
                response = login_client(client, password="wrong")
                self.assertEqual(response.status_code, 401)

            success_response = login_client(client)
            self.assertEqual(success_response.status_code, 200)

            response = login_client(client, password="wrong")

        self.assertEqual(response.status_code, 401)

    def test_me_returns_current_user_with_valid_cookie(self):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)
            response = client.get("/api/v1/auth/me")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["name"], "Tyler")

    def test_me_without_session_returns_401(self):
        with TestClient(create_app()) as client:
            response = client.get("/api/v1/auth/me")

        self.assertEqual(response.status_code, 401)

    def test_expired_session_returns_401(self):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)

            db = get_session_factory()()
            try:
                session = db.query(CustomShellSession).first()
                session.expires_at = utcnow() - timedelta(hours=1)
                db.commit()
            finally:
                db.close()

            response = client.get("/api/v1/auth/me")

        self.assertEqual(response.status_code, 401)

    def test_deleted_session_returns_401(self):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)

            db = get_session_factory()()
            try:
                db.query(CustomShellSession).delete()
                db.commit()
            finally:
                db.close()

            response = client.get("/api/v1/auth/me")

        self.assertEqual(response.status_code, 401)

    def test_logout_deletes_session_and_clears_cookie(self):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)
            response = client.post("/api/v1/auth/logout", headers={"Origin": APP_ORIGIN})
            me_response = client.get("/api/v1/auth/me")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(me_response.status_code, 401)

        db = get_session_factory()()
        try:
            self.assertEqual(db.query(CustomShellSession).count(), 0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
