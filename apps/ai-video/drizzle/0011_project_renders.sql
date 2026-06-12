-- One active render per project: status/result columns live on the project row
-- (no job table — rendering runs in-process like viral video processing).
ALTER TABLE "video_projects"
  ADD COLUMN "render_status" varchar(20),
  ADD COLUMN "render_error" text,
  ADD COLUMN "render_storage_path" varchar(500),
  ADD COLUMN "rendered_at" timestamptz;

ALTER TABLE "video_projects"
  ADD CONSTRAINT "video_projects_render_status_check"
  CHECK ("render_status" IN ('rendering', 'ready', 'error'));
