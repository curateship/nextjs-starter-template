-- The Trips dashboard in three panels (Tyler, 12 Nov 2026: "We need to
-- consolidate and reorganize the trips dashboard. It needs to be one cohesive
-- 3 panel design").
--
-- Each person's left page on it: what is written there, its cover and its
-- lock, the same shape as the CRM's page, the layout of Overview's widgets,
-- and the Dashboards block's hidden sections and their order. A person with
-- no row sees the page's starting blocks and the starting widgets.
CREATE TABLE IF NOT EXISTS "travel_trips_pages" (
  "user_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "locked" boolean NOT NULL DEFAULT false,
  "widgets" jsonb,
  "sections" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL
);

-- A saved place deleted from Places goes into a bin for 30 days, as a trip
-- does, and can be put back until then.
ALTER TABLE "travel_saved_places" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
