"""initial modular scraper schema

Revision ID: 001
Revises:
Create Date: 2026-05-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

jsonb = postgresql.JSONB()


def upgrade() -> None:
    _drop_existing_scraper_tables()

    op.create_table(
        "scraper_modules",
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("capabilities", jsonb, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_index("ix_scraper_modules_enabled", "scraper_modules", ["enabled"])

    op.create_table(
        "scraper_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("module_key", sa.String(length=100), nullable=False),
        sa.Column("input", jsonb, nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_raw_items", sa.Integer(), nullable=False),
        sa.Column("total_results", sa.Integer(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["module_key"], ["scraper_modules.key"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scraper_runs_created_at", "scraper_runs", ["created_at"])
    op.create_index("ix_scraper_runs_module_key", "scraper_runs", ["module_key"])
    op.create_index("ix_scraper_runs_scheduled_for", "scraper_runs", ["scheduled_for"])
    op.create_index("ix_scraper_runs_status", "scraper_runs", ["status"])

    op.create_table(
        "scraper_schedules",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("module_key", sa.String(length=100), nullable=False),
        sa.Column("input", jsonb, nullable=False),
        sa.Column("cadence", sa.String(length=50), nullable=False),
        sa.Column("timezone", sa.String(length=100), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["module_key"], ["scraper_modules.key"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scraper_schedules_active", "scraper_schedules", ["active"])
    op.create_index("ix_scraper_schedules_module_key", "scraper_schedules", ["module_key"])
    op.create_index("ix_scraper_schedules_next_run_at", "scraper_schedules", ["next_run_at"])

    op.create_table(
        "scraper_run_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["scraper_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "attempt_number", name="scraper_run_attempts_run_attempt_unique"),
    )
    op.create_index("ix_scraper_run_attempts_run_id", "scraper_run_attempts", ["run_id"])
    op.create_index("ix_scraper_run_attempts_status", "scraper_run_attempts", ["status"])

    op.create_table(
        "scraper_raw_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("module_key", sa.String(length=100), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("external_id", sa.String(length=512), nullable=True),
        sa.Column("raw_payload", jsonb, nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["module_key"], ["scraper_modules.key"]),
        sa.ForeignKeyConstraint(["run_id"], ["scraper_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scraper_raw_items_captured_at", "scraper_raw_items", ["captured_at"])
    op.create_index("ix_scraper_raw_items_external_id", "scraper_raw_items", ["external_id"])
    op.create_index("ix_scraper_raw_items_module_key", "scraper_raw_items", ["module_key"])
    op.create_index("ix_scraper_raw_items_run_id", "scraper_raw_items", ["run_id"])

    op.create_table(
        "page_metadata_pages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("normalized_url", sa.Text(), nullable=False),
        sa.Column("final_url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("h1", sa.Text(), nullable=True),
        sa.Column("canonical_url", sa.Text(), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("link_count", sa.Integer(), nullable=False),
        sa.Column("image_count", sa.Integer(), nullable=False),
        sa.Column("word_count", sa.Integer(), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("normalized_url"),
    )
    op.create_index("ix_page_metadata_pages_first_seen_at", "page_metadata_pages", ["first_seen_at"])
    op.create_index("ix_page_metadata_pages_last_seen_at", "page_metadata_pages", ["last_seen_at"])
    op.create_index("ix_page_metadata_pages_normalized_url", "page_metadata_pages", ["normalized_url"])
    op.create_index("ix_page_metadata_pages_status_code", "page_metadata_pages", ["status_code"])

    op.create_table(
        "page_metadata_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("page_id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("raw_item_id", sa.String(length=36), nullable=False),
        sa.Column("request_url", sa.Text(), nullable=False),
        sa.Column("final_url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("h1", sa.Text(), nullable=True),
        sa.Column("canonical_url", sa.Text(), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("link_count", sa.Integer(), nullable=False),
        sa.Column("image_count", sa.Integer(), nullable=False),
        sa.Column("word_count", sa.Integer(), nullable=False),
        sa.Column("raw_payload", jsonb, nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["page_id"], ["page_metadata_pages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["raw_item_id"], ["scraper_raw_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["scraper_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_page_metadata_snapshots_captured_at", "page_metadata_snapshots", ["captured_at"])
    op.create_index("ix_page_metadata_snapshots_page_id", "page_metadata_snapshots", ["page_id"])
    op.create_index("ix_page_metadata_snapshots_raw_item_id", "page_metadata_snapshots", ["raw_item_id"])
    op.create_index("ix_page_metadata_snapshots_run_id", "page_metadata_snapshots", ["run_id"])
    op.create_index("ix_page_metadata_snapshots_status_code", "page_metadata_snapshots", ["status_code"])

    op.create_table(
        "scraper_results",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("raw_item_id", sa.String(length=36), nullable=True),
        sa.Column("module_key", sa.String(length=100), nullable=False),
        sa.Column("module_record_table", sa.String(length=255), nullable=False),
        sa.Column("module_record_id", sa.String(length=36), nullable=False),
        sa.Column("external_id", sa.String(length=512), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("sortable_text", sa.Text(), nullable=True),
        sa.Column("metrics", jsonb, nullable=False),
        sa.Column("details", jsonb, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["module_key"], ["scraper_modules.key"]),
        sa.ForeignKeyConstraint(["raw_item_id"], ["scraper_raw_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["run_id"], ["scraper_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scraper_results_created_at", "scraper_results", ["created_at"])
    op.create_index("ix_scraper_results_external_id", "scraper_results", ["external_id"])
    op.create_index("ix_scraper_results_module_key", "scraper_results", ["module_key"])
    op.create_index("ix_scraper_results_module_record_id", "scraper_results", ["module_record_id"])
    op.create_index("ix_scraper_results_run_id", "scraper_results", ["run_id"])


def downgrade() -> None:
    op.drop_table("scraper_results")
    op.drop_table("page_metadata_snapshots")
    op.drop_table("page_metadata_pages")
    op.drop_table("scraper_raw_items")
    op.drop_table("scraper_run_attempts")
    op.drop_table("scraper_schedules")
    op.drop_table("scraper_runs")
    op.drop_table("scraper_modules")


def _drop_existing_scraper_tables() -> None:
    tables = [
        "scraper_results",
        "page_metadata_snapshots",
        "page_metadata_pages",
        "scraper_raw_items",
        "scraper_run_attempts",
        "scraper_schedules",
        "scraper_runs",
        "scraper_place_snapshots",
        "scraper_run_results",
        "scraper_places",
        "scraper_modules",
    ]
    dialect_name = op.get_bind().dialect.name
    for table in tables:
        if dialect_name == "postgresql":
            op.execute(sa.text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))
        else:
            op.execute(sa.text(f'DROP TABLE IF EXISTS "{table}"'))
