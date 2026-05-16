import unittest

from fastapi.testclient import TestClient

from app.db import get_session_factory
from app.main import create_app
from app.models import CustomShellFeedback, CustomShellFeedbackVote

from helpers import APP_ORIGIN, DatabaseTestCase, create_user, login_client


class FeedbackApiTest(DatabaseTestCase):
    def test_feedback_routes_require_auth(self):
        with TestClient(create_app()) as client:
            list_response = client.get("/api/v1/feedback")
            create_response = client.post(
                "/api/v1/feedback",
                json={"type": "suggestion", "message": "Add exports"},
                headers={"Origin": APP_ORIGIN},
            )
            vote_response = client.post(
                "/api/v1/feedback/feedback-id/vote",
                headers={"Origin": APP_ORIGIN},
            )

        self.assertEqual(list_response.status_code, 401)
        self.assertEqual(create_response.status_code, 401)
        self.assertEqual(vote_response.status_code, 401)

    def test_create_each_feedback_type(self):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)
            responses = [
                client.post(
                    "/api/v1/feedback",
                    json={"type": feedback_type, "message": f"{feedback_type} message"},
                    headers={"Origin": APP_ORIGIN},
                )
                for feedback_type in ["suggestion", "bug_report", "question", "praise"]
            ]

        self.assertTrue(all(response.status_code == 201 for response in responses))
        self.assertEqual([response.json()["type"] for response in responses], ["suggestion", "bug_report", "question", "praise"])

        db = get_session_factory()()
        try:
            self.assertEqual(db.query(CustomShellFeedback).count(), 4)
        finally:
            db.close()

    def test_list_feedback_returns_vote_counts_and_current_user_vote(self):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)
            create_response = client.post(
                "/api/v1/feedback",
                json={"type": "suggestion", "message": "Add feedback board"},
                headers={"Origin": APP_ORIGIN},
            )
            feedback_id = create_response.json()["id"]
            client.post(f"/api/v1/feedback/{feedback_id}/vote", headers={"Origin": APP_ORIGIN})
            response = client.get("/api/v1/feedback")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["feedback"][0]["vote_count"], 1)
        self.assertTrue(response.json()["feedback"][0]["has_voted"])

    def test_vote_toggles_suggestion_vote(self):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)
            create_response = client.post(
                "/api/v1/feedback",
                json={"type": "suggestion", "message": "Add keyboard shortcuts"},
                headers={"Origin": APP_ORIGIN},
            )
            feedback_id = create_response.json()["id"]

            upvote_response = client.post(f"/api/v1/feedback/{feedback_id}/vote", headers={"Origin": APP_ORIGIN})
            unvote_response = client.post(f"/api/v1/feedback/{feedback_id}/vote", headers={"Origin": APP_ORIGIN})

        self.assertEqual(upvote_response.status_code, 200)
        self.assertEqual(upvote_response.json()["vote_count"], 1)
        self.assertTrue(upvote_response.json()["has_voted"])
        self.assertEqual(unvote_response.status_code, 200)
        self.assertEqual(unvote_response.json()["vote_count"], 0)
        self.assertFalse(unvote_response.json()["has_voted"])

        db = get_session_factory()()
        try:
            self.assertEqual(db.query(CustomShellFeedbackVote).count(), 0)
        finally:
            db.close()

    def test_rejects_vote_on_non_suggestion_feedback(self):
        create_user()

        with TestClient(create_app()) as client:
            login_client(client)
            create_response = client.post(
                "/api/v1/feedback",
                json={"type": "bug_report", "message": "The page is clipped"},
                headers={"Origin": APP_ORIGIN},
            )
            feedback_id = create_response.json()["id"]
            response = client.post(f"/api/v1/feedback/{feedback_id}/vote", headers={"Origin": APP_ORIGIN})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Only suggestions can be upvoted")


if __name__ == "__main__":
    unittest.main()
