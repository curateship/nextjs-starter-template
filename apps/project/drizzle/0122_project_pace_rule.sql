-- A project's status is now worked out from its late tasks (Tyler, 19 Oct
-- 2026): Slowing down from `slowing_at` late tasks, Behind from `behind_at`,
-- On track below both, each set per project in Project settings. The manual
-- status columns (0117) stay as history and are no longer written.
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "slowing_at" smallint NOT NULL DEFAULT 1;
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "behind_at" smallint NOT NULL DEFAULT 3;
