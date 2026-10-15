-- The order of My dashboard's Board columns, each person's own (Tyler, 14 Oct
-- 2026). My dashboard's cards come from several projects, so no project's
-- order fits; empty is the usual To do, Doing, Done, Stuck.
ALTER TABLE "project_team_members" ADD COLUMN IF NOT EXISTS "my_status_order" text[] NOT NULL DEFAULT '{}';
