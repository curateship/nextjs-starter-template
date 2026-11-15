-- A team's own page of notes and "/" blocks at the top of the Team dashboard's
-- left panel, which only the site admin writes and every member reads (task
-- "Team dashboard/admin-3-panel-design", Tyler, 7 Nov 2026: "checkins, workload
-- and attention becomes blocks for the left panel").
ALTER TABLE "project_teams" ADD COLUMN IF NOT EXISTS "notes" text NOT NULL DEFAULT '';
