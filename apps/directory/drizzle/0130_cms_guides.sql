-- Guides the editor writes.
--
-- A guide is a named, ordered list of listings with a cover and an intro,
-- published at /guides/<address>: "Best brunch in the west end". It belongs to
-- the site, unlike a visitor's saved list, and has a page of its own.
--
-- Deleting a listing takes it out of every guide, by the cascade on
-- `listing_id`. A listing that is unpublished stays in the guide and is left
-- off the public page until it is published again.
--
-- A renamed guide's old address forwards like a listing's, so the old-address
-- table learns the new kind.

CREATE TABLE IF NOT EXISTS "directory_guides" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  "slug" varchar(160) NOT NULL,
  "intro" varchar(1000) NOT NULL DEFAULT '',
  "cover_image" varchar(600) NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "directory_guides_status_check"
    CHECK ("status" IN ('draft', 'published')),
  CONSTRAINT "directory_guides_published_at_check"
    CHECK ("status" <> 'published' OR "published_at" IS NOT NULL)
);

-- One address per guide within a site. Another site may use the same one.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_guides_workspace_slug"
  ON "directory_guides" ("workspace_id", "slug");

CREATE INDEX IF NOT EXISTS "ix_directory_guides_workspace_status"
  ON "directory_guides" ("workspace_id", "status", "published_at");

CREATE TABLE IF NOT EXISTS "directory_guide_items" (
  "id" varchar(36) PRIMARY KEY,
  "guide_id" varchar(36) NOT NULL
    REFERENCES "directory_guides"("id") ON DELETE CASCADE,
  "listing_id" varchar(36) NOT NULL
    REFERENCES "directory_listings"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  CONSTRAINT "directory_guide_items_position_check"
    CHECK ("position" >= 0)
);

-- A listing appears in a guide once.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_guide_items_guide_listing"
  ON "directory_guide_items" ("guide_id", "listing_id");

CREATE INDEX IF NOT EXISTS "ix_directory_guide_items_listing"
  ON "directory_guide_items" ("listing_id");

ALTER TABLE "old_addresses"
  DROP CONSTRAINT IF EXISTS "old_addresses_kind_check";

ALTER TABLE "old_addresses"
  ADD CONSTRAINT "old_addresses_kind_check"
    CHECK ("kind" IN ('listing', 'event', 'post', 'promotion', 'guide'));
