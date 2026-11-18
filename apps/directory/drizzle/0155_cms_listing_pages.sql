-- The Listings dashboard's left page, one per site (Tyler, 18 Nov 2026:
-- "Cosolidate listings into one 3 panel dashboard. Match design pattern of
-- the shell 1 to 1"). The same shape as automation_pages, plus the layout of
-- Overview's widgets and the Dashboards block's hidden rows and their order:
-- what is written on it, its cover photo and the page's own cover pictures,
-- and its lock. A site with no row shows the page's starting blocks and the
-- starting widgets.
CREATE TABLE IF NOT EXISTS "directory_listing_pages" (
  "workspace_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "locked" boolean NOT NULL DEFAULT false,
  "widgets" jsonb,
  "sections" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL
);
