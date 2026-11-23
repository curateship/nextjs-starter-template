-- Promotions: deals an admin writes, one deal at one of the site's listings,
-- like "Two-for-one pasta Tuesdays" at a restaurant. Visitors find them on the
-- Deals page at /deals and each deal's own page at /deals/<address>.
--
-- The start and end are days on the site's calendar, stored as plain dates the
-- same way events store theirs, and read against the site's time zone when
-- they are used. A deal runs to the end of its end day, so it leaves the Deals
-- page the next morning by the site's clock with no job to hide it. A deal with
-- no end day runs until somebody ends it.
CREATE TABLE IF NOT EXISTS "promotions" (
  "id" varchar(36) PRIMARY KEY,
  -- Deleting a site deletes its deals.
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  -- The place the deal is at. A deal with no place means nothing, so deleting
  -- the listing deletes its deals.
  "listing_id" varchar(36) NOT NULL
    REFERENCES "directory_listings"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  -- The address part after /deals/, unique within one site.
  "slug" varchar(160) NOT NULL,
  "description" varchar(2000) NOT NULL DEFAULT '',
  -- A media-library URL, or empty.
  "cover_image" varchar(600) NOT NULL DEFAULT '',
  -- The first day the deal is on, on the site's calendar.
  "start_date" date NOT NULL,
  -- The last day it is on, or empty for a deal with no end.
  "end_date" date,
  -- What a visitor says or types to get the deal, or empty for none.
  "code" varchar(40) NOT NULL DEFAULT '',
  "small_print" varchar(1000) NOT NULL DEFAULT '',
  -- 'draft' or 'published'. A draft is never readable by a visitor.
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  -- Set the first time the deal is published and kept after that.
  "published_at" timestamptz,
  -- The admin who wrote it. Kept as empty if that account is deleted.
  "created_by_user_id" varchar(36)
    REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "promotions_status_check"
    CHECK ("status" IN ('draft', 'published')),
  CONSTRAINT "promotions_published_has_date_check"
    CHECK ("status" <> 'published' OR "published_at" IS NOT NULL),
  -- A one-day deal ends on the day it starts.
  CONSTRAINT "promotions_end_after_start_check"
    CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_promotions_workspace_slug"
  ON "promotions" ("workspace_id", "slug");

-- Admin → Promotions and the Deals page both read one site's deals by day.
CREATE INDEX IF NOT EXISTS "ix_promotions_workspace_status_start"
  ON "promotions" ("workspace_id", "status", "start_date");

-- Deleting a listing finds its deals through this.
CREATE INDEX IF NOT EXISTS "ix_promotions_listing"
  ON "promotions" ("listing_id");
