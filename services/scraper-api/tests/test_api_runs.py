import unittest

from fastapi.testclient import TestClient

from app.main import create_app

from helpers import DatabaseTestCase


class RunsApiTest(DatabaseTestCase):
    def test_create_run_requires_admin_token(self):
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/v1/runs",
                json={"module_key": "page_metadata", "input": {"url": "https://example.com"}},
            )
            self.assertEqual(response.status_code, 401)

    def test_create_run_validates_input(self):
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/v1/runs",
                headers={"x-admin-token": "test-token"},
                json={"module_key": "page_metadata", "input": {"url": "http://localhost:3000"}},
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["detail"], "URL host is not public")

    def test_create_run_accepts_public_url(self):
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/v1/runs",
                headers={"x-admin-token": "test-token"},
                json={"module_key": "page_metadata", "input": {"url": "https://example.com"}},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["run"]["status"], "queued")


if __name__ == "__main__":
    unittest.main()
