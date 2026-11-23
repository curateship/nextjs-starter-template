-- Each step's own name-and-value fields (Tyler, 28 Oct 2026, Misc 4: "Make
-- each step its own card and add ability to add fields to each step", then
-- "name and value"). A task template keeps the fields of its starting steps,
-- by the step's words.
ALTER TABLE "project_task_steps" ADD COLUMN IF NOT EXISTS "fields" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "project_task_types" ADD COLUMN IF NOT EXISTS "step_fields" jsonb NOT NULL DEFAULT '{}'::jsonb;
