-- A team's page on the Team dashboard can be locked from Team settings so it
-- reads only, blocks and all, until it's unlocked, as the site admin's own
-- page can (Tyler, 7 Nov 2026: "the lock blocks button is missing").
ALTER TABLE "project_teams" ADD COLUMN IF NOT EXISTS "notes_locked" boolean NOT NULL DEFAULT false;
