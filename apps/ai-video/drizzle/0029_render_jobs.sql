-- Durable render queue: exports are claimed by an in-process worker with a
-- bounded concurrency instead of running fire-and-forget. The video_projects
-- render_* columns stay as the "latest render" mirror the UI reads.
CREATE TABLE IF NOT EXISTS "render_jobs" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "video_projects"("id") ON DELETE CASCADE,
  "quality" varchar(10) NOT NULL,
  "status" varchar(20) NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "lease_token" varchar(36),
  "lease_expires_at" timestamp with time zone,
  "error_message" text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "render_jobs_status_check" CHECK ("status" in ('queued', 'running', 'ready', 'error', 'cancelled')),
  CONSTRAINT "render_jobs_quality_check" CHECK ("quality" in ('high', 'medium', 'low'))
);

-- One active job per project: makes duplicate enqueues idempotent at the
-- database level, no matter how they race.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_render_jobs_project_active"
  ON "render_jobs" ("project_id") WHERE "status" in ('queued', 'running');
CREATE INDEX IF NOT EXISTS "ix_render_jobs_status_created" ON "render_jobs" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "ix_render_jobs_user_id" ON "render_jobs" ("user_id");

-- The latest-render mirror can now show a queued export.
ALTER TABLE "video_projects" DROP CONSTRAINT IF EXISTS "video_projects_render_status_check";
ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_render_status_check"
  CHECK ("render_status" in ('queued', 'rendering', 'ready', 'error'));

-- Pre-queue renders ran in-process with no recovery: any row still 'rendering'
-- at cutover is a wedged orphan from a dead process (there is no job to
-- reclaim it). Surface those as an explicit error instead of an endless spin.
UPDATE "video_projects"
  SET "render_status" = 'error', "render_error" = 'Render was interrupted'
  WHERE "render_status" = 'rendering';
