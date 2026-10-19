-- A project's two pictures, set in Project settings (Tyler, 19 Oct 2026): a
-- banner drawn faintly behind the top of the project page's left panel, and a
-- round avatar at its foot. Each is a media library address, or null for none.
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "banner_url" text;
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "avatar_url" text;
