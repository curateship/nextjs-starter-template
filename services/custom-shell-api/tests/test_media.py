from io import BytesIO
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.db import get_session_factory
from app.main import create_app
from app.media_storage import R2StorageNotConfiguredError
from app.models import CustomShellMedia

from helpers import APP_ORIGIN, DatabaseTestCase, create_user, login_client


class MediaApiTest(DatabaseTestCase):
    def test_media_routes_require_auth(self):
        with TestClient(create_app()) as client:
            list_response = client.get("/api/v1/media")
            upload_response = client.post(
                "/api/v1/media",
                files={"file": ("image.png", b"image", "image/png")},
                headers={"Origin": APP_ORIGIN},
            )
            bulk_response = client.post(
                "/api/v1/media/bulk-delete",
                json={"ids": ["missing"]},
                headers={"Origin": APP_ORIGIN},
            )
            file_response = client.get("/api/v1/media/missing/file")

        self.assertEqual(list_response.status_code, 401)
        self.assertEqual(upload_response.status_code, 401)
        self.assertEqual(bulk_response.status_code, 401)
        self.assertEqual(file_response.status_code, 401)

    def test_upload_rejects_invalid_type(self):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)
            response = client.post(
                "/api/v1/media",
                files={"file": ("script.js", b"alert(1)", "application/javascript")},
                headers={"Origin": APP_ORIGIN},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid file type", response.json()["detail"])

    @patch("app.routes.media.upload_to_r2", side_effect=R2StorageNotConfiguredError("missing"))
    def test_upload_reports_missing_r2_configuration(self, upload_to_r2):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)
            response = client.post(
                "/api/v1/media",
                files={"file": ("hero.png", b"image", "image/png")},
                headers={"Origin": APP_ORIGIN},
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("R2 storage is not configured", response.json()["detail"])
        upload_to_r2.assert_called_once()

    @patch("app.routes.media.upload_to_r2")
    def test_upload_lists_and_updates_owned_media(self, upload_to_r2):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)
            upload_response = client.post(
                "/api/v1/media",
                data={"alt_text": "Old alt"},
                files={"file": ("hero image.png", b"image", "image/png")},
                headers={"Origin": APP_ORIGIN},
            )
            media_id = upload_response.json()["id"]
            list_response = client.get("/api/v1/media")
            update_response = client.put(
                f"/api/v1/media/{media_id}",
                json={"alt_text": "New alt"},
                headers={"Origin": APP_ORIGIN},
            )

        self.assertEqual(upload_response.status_code, 201)
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json()["total"], 1)
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["alt_text"], "New alt")
        upload_to_r2.assert_called_once()

    @patch("app.routes.media.upload_to_r2")
    def test_media_is_private_per_user(self, upload_to_r2):
        create_user()
        create_user(email="alex@internal.dev")

        with TestClient(create_app()) as owner_client:
            login_client(owner_client)
            upload_response = owner_client.post(
                "/api/v1/media",
                files={"file": ("hero.png", b"image", "image/png")},
                headers={"Origin": APP_ORIGIN},
            )
            media_id = upload_response.json()["id"]

        with TestClient(create_app()) as other_client:
            login_client(other_client, email="alex@internal.dev")
            list_response = other_client.get("/api/v1/media")
            file_response = other_client.get(f"/api/v1/media/{media_id}/file")

        self.assertEqual(upload_response.status_code, 201)
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json()["total"], 0)
        self.assertEqual(file_response.status_code, 404)
        upload_to_r2.assert_called_once()

    @patch("app.routes.media.delete_from_r2")
    @patch("app.routes.media.upload_to_r2")
    def test_delete_removes_owned_media(self, upload_to_r2, delete_from_r2):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)
            upload_response = client.post(
                "/api/v1/media",
                files={"file": ("hero.png", b"image", "image/png")},
                headers={"Origin": APP_ORIGIN},
            )
            media_id = upload_response.json()["id"]
            delete_response = client.delete(
                f"/api/v1/media/{media_id}",
                headers={"Origin": APP_ORIGIN},
            )

        self.assertEqual(delete_response.status_code, 204)
        delete_from_r2.assert_called_once()

        db = get_session_factory()()
        try:
            self.assertEqual(db.query(CustomShellMedia).count(), 0)
        finally:
            db.close()

    @patch("app.routes.media.delete_from_r2")
    @patch("app.routes.media.upload_to_r2")
    def test_bulk_delete_removes_owned_media(self, upload_to_r2, delete_from_r2):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)
            ids = []
            for name in ["one.png", "two.png"]:
                response = client.post(
                    "/api/v1/media",
                    files={"file": (name, b"image", "image/png")},
                    headers={"Origin": APP_ORIGIN},
                )
                ids.append(response.json()["id"])

            bulk_response = client.post(
                "/api/v1/media/bulk-delete",
                json={"ids": ids},
                headers={"Origin": APP_ORIGIN},
            )

        self.assertEqual(bulk_response.status_code, 200)
        self.assertEqual(bulk_response.json()["deleted_count"], 2)
        self.assertEqual(delete_from_r2.call_count, 2)

    @patch("app.routes.media.get_from_r2")
    def test_file_streaming_supports_range_requests(self, get_from_r2):
        user = create_user()
        db = get_session_factory()()
        try:
            row = CustomShellMedia(
                user_id=user.id,
                filename="clip.mp4",
                original_name="clip.mp4",
                file_size=3,
                mime_type="video/mp4",
                file_type="video",
                storage_path=f"{user.id}/clip.mp4",
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            media_id = row.id
        finally:
            db.close()

        get_from_r2.return_value = {
            "Body": BytesIO(b"abc"),
            "ContentType": "video/mp4",
            "ContentLength": 3,
            "ContentRange": "bytes 0-2/3",
        }

        with TestClient(create_app()) as client:
            login_client(client)
            response = client.get(
                f"/api/v1/media/{media_id}/file",
                headers={"Range": "bytes=0-2"},
            )

        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, b"abc")
        self.assertEqual(response.headers["content-range"], "bytes 0-2/3")
        get_from_r2.assert_called_once()


if __name__ == "__main__":
    unittest.main()
