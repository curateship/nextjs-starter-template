-- Everything about one video lives in its project (task project-first/01).
--
-- A first frame belongs to the one project it was made in. It is never shared:
-- an opening image fits one video. Deleting the project deletes its frames.
-- The column stays nullable only for frames made before this change that no
-- project's timeline uses; no screen shows those, and they are deleted once
-- Tyler has seen the list.
ALTER TABLE "video_first_frames" ADD COLUMN IF NOT EXISTS "project_id" varchar(36)
  REFERENCES "video_projects" ("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "ix_video_first_frames_project_created"
  ON "video_first_frames" ("project_id", "created_at");

-- An older frame joins the project whose timeline has a clip showing its
-- picture. A picture used in two projects goes to the one changed last.
UPDATE "video_first_frames" AS frame
SET "project_id" = (
  SELECT project."id"
  FROM "video_projects" AS project
  WHERE project."user_id" = frame."user_id"
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(project."timeline" -> 'tracks', '[]'::jsonb)) AS track
      CROSS JOIN jsonb_array_elements(COALESCE(track -> 'clips', '[]'::jsonb)) AS clip
      WHERE clip ->> 'mediaId' = frame."image_media_id"
    )
  ORDER BY project."updated_at" DESC
  LIMIT 1
)
WHERE frame."project_id" IS NULL;

-- The viral video a project copies, set by "Copy this" on the Viral page and
-- the creators dashboard. Deleting the saved video blanks it; the project stays.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "source_viral_video_id" varchar(36)
  REFERENCES "video_viral_videos" ("id") ON DELETE SET NULL;

-- When the project was archived. An archived project leaves the projects list
-- and keeps everything; bringing it back blanks this.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

-- When the project was pinned. A pinned project sits at the top of the list
-- whatever the sort; the earliest pin comes first.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "pinned_at" timestamp with time zone;

-- The most AI spending this project may reach, in cents. Empty means no limit.
-- Spending is read from ai_usage_events rows whose metadata names the project.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "spend_limit_cents" integer;
DO $$ BEGIN
  ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_spend_limit_check"
    CHECK ("spend_limit_cents" IS NULL OR "spend_limit_cents" BETWEEN 1 AND 10000000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- What a project's spend line adds up, without reading every row of the meter.
CREATE INDEX IF NOT EXISTS "ix_ai_usage_events_project"
  ON "ai_usage_events" (("metadata" ->> 'projectId'))
  WHERE "metadata" ? 'projectId';
