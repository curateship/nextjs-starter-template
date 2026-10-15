-- The order of a project's Board columns (To do, Doing, Done, Stuck), which
-- anyone on the project sets by dragging a column's heading and everyone on it
-- sees (Tyler, 14 Oct 2026). Empty is the usual order; a status missing from
-- a saved order goes at the end.
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "status_order" text[] NOT NULL DEFAULT '{}';
