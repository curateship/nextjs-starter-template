-- Fields a site invents for its own listings.
--
-- The definitions are one row per section, per site; a section's fields are
-- the jsonb on that row, since they are only ever read with their section.
-- The answers are a column on the listing rather than a table of their own,
-- for the same reason its opening hours and its gallery are: they are read
-- with the listing and never queried across listings.

CREATE TABLE IF NOT EXISTS "directory_custom_sections" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  -- Fixed at creation. It is the key every listing's answers are stored
  -- under, which is what lets a section be renamed without losing them.
  "slug" varchar(80) NOT NULL,
  "layout" varchar(20) NOT NULL DEFAULT 'stack',
  "fields" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_custom_sections_workspace_slug"
  ON "directory_custom_sections" ("workspace_id", "slug");
CREATE INDEX IF NOT EXISTS "ix_directory_custom_sections_workspace_order"
  ON "directory_custom_sections" ("workspace_id", "display_order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'directory_custom_sections_layout_check'
  ) THEN
    ALTER TABLE "directory_custom_sections"
      ADD CONSTRAINT "directory_custom_sections_layout_check"
      CHECK ("layout" IN ('stack', 'card', 'two-column'));
  END IF;
END $$;

-- Every existing listing starts with no answers, which is exactly how it
-- behaved before this migration: a site with no sections shows nothing new.
ALTER TABLE "directory_listings"
  ADD COLUMN IF NOT EXISTS "custom_values" jsonb NOT NULL DEFAULT '{}'::jsonb;
