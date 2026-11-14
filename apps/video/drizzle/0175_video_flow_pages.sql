-- The Flow dashboard's left page, one per person (workspace/docs/flow.md,
-- the Admin 3 panel design). The same shape as automation_pages: what is
-- written on it, its cover photo and the page's own cover pictures, and its
-- lock. With it, the Dashboards block's rows the person hid and the order
-- they dragged them into, which Automations keeps with the site's look.
-- A person with no row sees the page's starting blocks.
CREATE TABLE IF NOT EXISTS "video_flow_pages" (
  "user_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "locked" boolean NOT NULL DEFAULT false,
  "hidden_sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "section_order" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamp with time zone NOT NULL
);
