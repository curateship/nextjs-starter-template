import unittest

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import CustomShellSettings
from app.routes.shell_settings import DEFAULT_SETTINGS_KEY
from app.db import get_session_factory

from helpers import DatabaseTestCase


VALID_SETTINGS = {
    "appName": "custom-shell",
    "workspaceName": "custom-shell",
    "workspacePlan": "Internal",
    "themePreset": "graphite",
    "fontPreset": "urbanist",
    "topNavigation": [
        {
            "id": "top-nav-dashboard",
            "label": "Dashboard 1",
            "href": "/",
            "icon": "panelsTopLeft",
            "visible": True,
        }
    ],
    "sections": [
        {
            "id": "section-starter",
            "title": "Starter Navigation",
            "entries": [
                {
                    "type": "item",
                    "id": "item-settings",
                    "label": "Settings",
                    "href": "/admin/settings",
                    "icon": "settings",
                    "visible": True,
                }
            ],
        }
    ],
}


class ShellSettingsApiTest(DatabaseTestCase):
    def test_get_empty_db_returns_no_settings(self):
        with TestClient(create_app()) as client:
            response = client.get("/api/v1/shell-settings")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["settings"])

    def test_put_stores_json(self):
        with TestClient(create_app()) as client:
            response = client.put("/api/v1/shell-settings", json=VALID_SETTINGS)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["settings"], VALID_SETTINGS)

        db = get_session_factory()()
        try:
            row = db.get(CustomShellSettings, DEFAULT_SETTINGS_KEY)
            self.assertIsNotNone(row)
            self.assertEqual(row.settings, VALID_SETTINGS)
        finally:
            db.close()

    def test_get_after_put_returns_same_json(self):
        with TestClient(create_app()) as client:
            put_response = client.put("/api/v1/shell-settings", json=VALID_SETTINGS)
            get_response = client.get("/api/v1/shell-settings")

        self.assertEqual(put_response.status_code, 200)
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json()["settings"], VALID_SETTINGS)

    def test_invalid_json_shape_is_rejected(self):
        with TestClient(create_app()) as client:
            response = client.put(
                "/api/v1/shell-settings",
                json={"sections": []},
            )

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
