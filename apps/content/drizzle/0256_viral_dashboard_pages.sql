-- One Viral dashboard (task features/03, Tyler, 19 and 21 Nov 2026: "combine
-- all these dashboard into one 3 panel dashboard"). Today, Projects, Vault
-- and Library become /admin/viral.
--
-- viral_dashboard_pages: each person's left page of the dashboard, one row
-- per person because every Viral record belongs to its owner. What is
-- written on it, its cover, its lock, Overview's widget layout, and the
-- Dashboards block's hidden rows and their order. Nobody with a row sees the
-- starting page.
CREATE TABLE IF NOT EXISTS "viral_dashboard_pages" (
  "owner_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL DEFAULT '',
  "cover_url" text,
  "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "locked" boolean NOT NULL DEFAULT false,
  "widgets" jsonb,
  "sections" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL
);

-- A project's own page, its notes, takes the shell's Cover photo row and
-- Lock blocks, as Promo's project page has them. cover_images holds the
-- pictures it has had, for the row's tiles; the cover itself stays in
-- cover_url and cover_chosen.
ALTER TABLE "viral_projects" ADD COLUMN IF NOT EXISTS "cover_images" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "viral_projects" ADD COLUMN IF NOT EXISTS "notes_locked" boolean NOT NULL DEFAULT false;
