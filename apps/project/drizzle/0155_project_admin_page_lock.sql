-- The site admin's own page on My dashboard can be locked from My settings so
-- it reads only until it's unlocked, as a project's page and a task's notes
-- can (Tyler, 6 Nov 2026: "lock the notes option is missing").
ALTER TABLE "project_site_admin_prefs" ADD COLUMN IF NOT EXISTS "notes_locked" boolean NOT NULL DEFAULT false;
