-- A run picks its project last (Tyler, 14 Nov 2026, of the project box under
-- Run: "this should be removed. its the last step"). Additions only.
--
--   project_id  Empty until the run's last step saves it into a project.
--   timeline    The cut AI video made, kept on the run until it is saved;
--               saving makes the project's video from it.
ALTER TABLE "video_flow_runs" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "video_flow_runs" ADD COLUMN IF NOT EXISTS "timeline" jsonb;
