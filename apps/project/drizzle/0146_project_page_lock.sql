-- The project's page can be locked from its ⋮ menu so it reads only, even for
-- the site admin, until it's unlocked (Tyler, 5 Nov 2026, pointing at the
-- menu's line above Archive project: "add a function here to lock the tip
-- tap").
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "notes_locked" boolean NOT NULL DEFAULT false;
