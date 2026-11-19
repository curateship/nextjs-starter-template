-- The Events dashboard's left page, one per site (task events/37, Part 1),
-- the same shape as directory_listing_pages: what is written on it, its
-- cover, its lock, Overview's widget layout, and the Dashboards block's
-- hidden rows and their order. A site with no row shows the starting page.
CREATE TABLE IF NOT EXISTS "directory_event_pages" (
  "workspace_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "locked" boolean NOT NULL DEFAULT false,
  "widgets" jsonb,
  "sections" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL
);

-- Whether the person signing up was told "The host sees your name and
-- email." A listing's owner sees only the sign-ups that were, so nobody who
-- signed up before the notice existed has their email handed to an owner.
ALTER TABLE "event_sign_ups" ADD COLUMN IF NOT EXISTS "host_told" boolean NOT NULL DEFAULT false;
