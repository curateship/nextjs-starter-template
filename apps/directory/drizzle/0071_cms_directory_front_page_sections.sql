-- Several rows of listings on a site's home page, each one chosen properly.
--
-- Replaces `front_page_mode` and `front_page_count` on `directory_settings`,
-- which between them said "one row, newest or featured, across every
-- category". A row is now its own record: a heading, an optional line under
-- it, a category, an order, how many, and how it draws.
--
-- The two old columns are read into one row per site and then dropped, so
-- there is exactly one place that decides what a home page shows. A site that
-- had the front page switched off gets no rows and its home page carries on
-- being the platform's, unchanged.

CREATE TABLE IF NOT EXISTS "directory_front_page_sections" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "display_order" integer NOT NULL DEFAULT 0,
  "heading" varchar(120) NOT NULL,
  "intro" varchar(500) NOT NULL DEFAULT '',
  -- Null is "every category". A deleted category empties the row's filter
  -- rather than taking the row with it: an admin who deletes a category has
  -- not asked for a row of their home page to disappear.
  "category_id" varchar(36) REFERENCES "categories"("id") ON DELETE SET NULL,
  "sort" varchar(20) NOT NULL DEFAULT 'newest',
  "listing_count" integer NOT NULL DEFAULT 8,
  "layout" varchar(20) NOT NULL DEFAULT 'grid',
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_directory_front_page_sections_workspace_order"
  ON "directory_front_page_sections" ("workspace_id", "display_order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'directory_front_page_sections_sort_check'
  ) THEN
    ALTER TABLE "directory_front_page_sections"
      ADD CONSTRAINT "directory_front_page_sections_sort_check"
      CHECK ("sort" IN ('newest', 'featured', 'rating', 'name'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'directory_front_page_sections_layout_check'
  ) THEN
    ALTER TABLE "directory_front_page_sections"
      ADD CONSTRAINT "directory_front_page_sections_layout_check"
      CHECK ("layout" IN ('grid', 'list', 'map'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'directory_front_page_sections_count_check'
  ) THEN
    ALTER TABLE "directory_front_page_sections"
      ADD CONSTRAINT "directory_front_page_sections_count_check"
      CHECK ("listing_count" BETWEEN 1 AND 12);
  END IF;
END $$;

-- Every site that had the front page switched on gets one row showing exactly
-- what it showed before: the same listings, the same order, the same number.
-- Guarded on the old columns still being here so a replay is harmless.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'directory_settings' AND column_name = 'front_page_mode'
  ) THEN
    INSERT INTO "directory_front_page_sections"
      ("id", "workspace_id", "display_order", "heading", "intro",
       "category_id", "sort", "listing_count", "layout", "created_at", "updated_at")
    SELECT
      gen_random_uuid()::text,
      settings.workspace_id,
      0,
      CASE settings.front_page_mode
        WHEN 'featured' THEN 'Featured listings'
        ELSE 'Newest listings'
      END,
      '',
      NULL,
      CASE settings.front_page_mode WHEN 'featured' THEN 'featured' ELSE 'newest' END,
      greatest(1, least(12, coalesce(settings.front_page_count, 8))),
      'grid',
      now(),
      now()
    FROM "directory_settings" settings
    WHERE coalesce(settings.front_page_mode, 'off') <> 'off'
      AND NOT EXISTS (
        SELECT 1 FROM "directory_front_page_sections" existing
        WHERE existing.workspace_id = settings.workspace_id
      );
  END IF;
END $$;

ALTER TABLE "directory_settings" DROP CONSTRAINT IF EXISTS "directory_settings_front_page_mode_check";
ALTER TABLE "directory_settings" DROP CONSTRAINT IF EXISTS "directory_settings_front_page_count_check";
ALTER TABLE "directory_settings" DROP COLUMN IF EXISTS "front_page_mode";
ALTER TABLE "directory_settings" DROP COLUMN IF EXISTS "front_page_count";
