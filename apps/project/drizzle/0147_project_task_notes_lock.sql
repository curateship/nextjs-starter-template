-- A task's notes can be locked from the task's ⋮ menu so they read only, for
-- everyone, until they're unlocked (Tyler, 5 Nov 2026: "add lock page for
-- task too", after the project page's Lock page).
ALTER TABLE "project_tasks" ADD COLUMN IF NOT EXISTS "notes_locked" boolean NOT NULL DEFAULT false;
