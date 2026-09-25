-- Category cards somewhere other than a category page.
--
-- The cards themselves already exist: they are what a category page draws
-- underneath a parent. This lets a site put the same cards on its home page and
-- at the top of its browse page.
--
-- Two places, switched on two ways, because the two places work differently.
-- The home page is already a list of rows (0071), so a row of category cards is
-- one more kind of row — the row existing *is* the switch. The browse page has
-- no rows, so it gets a switch of its own on `directory_settings`.
--
-- Both are off to start with: every existing site gets `kind = 'listings'` on
-- the rows it already has, and `browse_categories_enabled = false`. Nothing
-- anywhere changes until an admin asks for it.

-- Which of the two kinds a home page row is, and — for a category row — which
-- categories it shows.
ALTER TABLE "directory_front_page_sections"
  ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'listings',
  ADD COLUMN IF NOT EXISTS "category_source" varchar(20) NOT NULL DEFAULT 'top-level',
  -- The chosen categories, in the order the admin arranged them. An array
  -- rather than a table because the order is the whole point and these are only
  -- ever read with their row. An id whose category has since been deleted is
  -- ignored on read, the same way an empty category is.
  ADD COLUMN IF NOT EXISTS "picked_category_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- The browse page's own switch and its own choice of categories.
ALTER TABLE "directory_settings"
  ADD COLUMN IF NOT EXISTS "browse_categories_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "browse_category_source" varchar(20) NOT NULL DEFAULT 'top-level',
  ADD COLUMN IF NOT EXISTS "browse_picked_category_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'directory_front_page_sections_kind_check'
  ) THEN
    ALTER TABLE "directory_front_page_sections"
      ADD CONSTRAINT "directory_front_page_sections_kind_check"
      CHECK ("kind" IN ('listings', 'categories'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'directory_front_page_sections_category_source_check'
  ) THEN
    ALTER TABLE "directory_front_page_sections"
      ADD CONSTRAINT "directory_front_page_sections_category_source_check"
      CHECK ("category_source" IN ('top-level', 'picked'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'directory_settings_browse_category_source_check'
  ) THEN
    ALTER TABLE "directory_settings"
      ADD CONSTRAINT "directory_settings_browse_category_source_check"
      CHECK ("browse_category_source" IN ('top-level', 'picked'));
  END IF;
END $$;
