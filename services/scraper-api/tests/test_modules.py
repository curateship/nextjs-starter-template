import pathlib

from sqlalchemy import inspect, select

from app.db import get_engine, get_session_factory
from app.models import ScraperModule
from app.modules.registry import get_module, list_modules

from helpers import DatabaseTestCase


class ModuleRegistryTest(DatabaseTestCase):
    def test_registry_contains_page_metadata(self):
        self.assertEqual(get_module("page_metadata").manifest.name, "Page Metadata")
        self.assertIn("page_metadata", [module.manifest.key for module in list_modules()])

    def test_seed_modules_persists_manifest(self):
        db = get_session_factory()()
        try:
            module = db.execute(select(ScraperModule).where(ScraperModule.key == "page_metadata")).scalar_one()
            self.assertTrue(module.enabled)
            self.assertTrue(module.capabilities["manual_runs"])
        finally:
            db.close()

    def test_schema_tables_exist(self):
        tables = set(inspect(get_engine()).get_table_names())
        self.assertTrue(
            {
                "scraper_modules",
                "scraper_runs",
                "scraper_run_attempts",
                "scraper_schedules",
                "scraper_raw_items",
                "scraper_results",
                "page_metadata_pages",
                "page_metadata_snapshots",
            }.issubset(tables)
        )

    def test_initial_migration_exists(self):
        migration = pathlib.Path("alembic/versions/001_initial_modular_scraper.py")
        self.assertTrue(migration.exists())
        contents = migration.read_text()
        self.assertIn("scraper_runs", contents)
        self.assertIn("page_metadata_pages", contents)
