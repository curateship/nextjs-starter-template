-- The Automations dashboard's left page, one per site (Tyler, 9 Nov 2026: "We
-- have to turn the automation dashboard into the 3 panel design pattern"). The
-- same shape as crm_pages: what is written on it, its cover photo and the
-- page's own cover pictures, and its lock. A site with no row shows the page's
-- starting blocks.
CREATE TABLE IF NOT EXISTS "automation_pages" (
  "workspace_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "locked" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL
);
