import unittest
from unittest.mock import patch

from sqlalchemy import select

from app.db import get_session_factory
from app.models import ScraperRawItem, ScraperResult, ScraperRun
from app.modules.page_metadata.models import PageMetadataPage, PageMetadataSnapshot
from app.modules.page_metadata.scraper import FetchedPage
from app.services.worker import process_run

from helpers import DatabaseTestCase


class WorkerTest(DatabaseTestCase):
    def test_worker_persists_page_metadata_run(self):
        db = get_session_factory()()
        try:
            run = ScraperRun(
                module_key="page_metadata",
                input={"url": "https://example.com"},
                status="queued",
            )
            db.add(run)
            db.commit()
            run_id = run.id
        finally:
            db.close()

        fetched = FetchedPage(
            request_url="https://example.com",
            final_url="https://example.com/",
            status_code=200,
            content_type="text/html",
            encoding="utf-8",
            body=b"<html><head><title>Example</title></head><body><h1>Hello</h1><p>World</p></body></html>",
        )

        with patch("app.modules.page_metadata.scraper.fetch_page", return_value=fetched):
            process_run(run_id)

        db = get_session_factory()()
        try:
            run = db.get(ScraperRun, run_id)
            self.assertEqual(run.status, "succeeded")
            self.assertEqual(run.total_raw_items, 1)
            self.assertEqual(run.total_results, 1)
            self.assertEqual(db.execute(select(ScraperRawItem)).scalars().first().external_id, "https://example.com/")
            self.assertEqual(db.execute(select(ScraperResult)).scalars().first().title, "Example")
            self.assertEqual(db.execute(select(PageMetadataPage)).scalars().first().title, "Example")
            self.assertEqual(db.execute(select(PageMetadataSnapshot)).scalars().first().h1, "Hello")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
