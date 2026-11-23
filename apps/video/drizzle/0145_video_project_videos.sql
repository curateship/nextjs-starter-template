-- A project holds many videos (workspace/tasks/projects/01-projects-hold-many.md,
-- section A; workspace/docs/project-videos.md). Until now a project row was
-- one video: its timeline sat on `video_projects`. From here a project keeps
-- what its videos share, and each video is a row of `video_project_videos`.
--
-- Every existing project becomes a project with one video. That video takes
-- the project's own id, so every old address, guest link and handoff that
-- names a project still finds its video, and every row below that already
-- names the project can name the video with the same id.
--
-- The deploy rule (docs/deployment.md, "Why that order matters"): the release
-- before this one keeps running for a minute or two beside the new database.
-- So nothing it reads is dropped or renamed here.
--   * video_projects keeps timeline, aspect, version, spend_limit_cents,
--     source_viral_video_id, source_viral_video_title,
--     source_viral_project_id, last_edited_by, language_of and language.
--     Nothing in this release reads or writes them. timeline and aspect lose
--     NOT NULL, because a project made from now on has neither; the old
--     release would show such a project as an empty timeline.
--   * video_project_thumbnails stays, unread, beside its per-video
--     replacement video_video_thumbnails.
-- The release after this one drops all of them in one migration, with the
-- video_id_from_project trigger below. That is the deletion condition: this
-- release live everywhere, then the drop ships.

CREATE TABLE IF NOT EXISTS "video_project_videos" (
  "id" varchar(36) PRIMARY KEY,
  "project_id" varchar(36) NOT NULL REFERENCES "video_projects" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "aspect" varchar(8) NOT NULL,
  "timeline" jsonb NOT NULL,
  -- Copied out of the timeline by every save, so the Videos tab lists
  -- hundreds of videos without reading a timeline.
  "clip_count" integer NOT NULL DEFAULT 0,
  "duration_ms" integer NOT NULL DEFAULT 0,
  "version" integer NOT NULL DEFAULT 1,
  -- draft, ready or posted, picked from the video's menu.
  "status" varchar(8) NOT NULL DEFAULT 'draft',
  "pinned_at" timestamptz,
  "archived_at" timestamptz,
  -- Each video has its own AI spend limit, in cents. NULL is no limit.
  "spend_limit_cents" integer,
  "source_viral_video_id" varchar(36) REFERENCES "video_viral_videos" ("id") ON DELETE SET NULL,
  "source_viral_video_title" text,
  "source_viral_project_id" varchar(36) REFERENCES "video_viral_projects" ("id") ON DELETE SET NULL,
  "last_edited_by" text,
  "language_of" varchar(36) REFERENCES "video_project_videos" ("id") ON DELETE SET NULL,
  "language" varchar(40),
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_project_videos_spend_limit_check"
    CHECK ("spend_limit_cents" IS NULL OR "spend_limit_cents" BETWEEN 1 AND 10000000),
  CONSTRAINT "video_project_videos_aspect_check"
    CHECK ("aspect" IN ('16:9', '9:16', '1:1', '4:3')),
  CONSTRAINT "video_project_videos_status_check"
    CHECK ("status" IN ('draft', 'ready', 'posted')),
  CONSTRAINT "video_project_videos_version_check" CHECK ("version" >= 1)
);
CREATE INDEX IF NOT EXISTS "ix_video_project_videos_project_updated"
  ON "video_project_videos" ("project_id", "updated_at");
CREATE INDEX IF NOT EXISTS "ix_video_project_videos_user"
  ON "video_project_videos" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_video_project_videos_language_of"
  ON "video_project_videos" ("language_of");
CREATE INDEX IF NOT EXISTS "ix_video_project_videos_source"
  ON "video_project_videos" ("source_viral_video_id")
  WHERE "source_viral_video_id" IS NOT NULL;

-- One video per existing project, with the project's id. language_of is set
-- in a second pass, once every video it can point at exists.
INSERT INTO "video_project_videos" (
  "id", "project_id", "user_id", "name", "aspect", "timeline", "version",
  "spend_limit_cents", "source_viral_video_id", "source_viral_video_title",
  "source_viral_project_id", "last_edited_by", "language", "created_at",
  "updated_at"
)
SELECT
  p."id", p."id", p."user_id", p."name", p."aspect", p."timeline", p."version",
  p."spend_limit_cents", p."source_viral_video_id", p."source_viral_video_title",
  p."source_viral_project_id", p."last_edited_by", p."language", p."created_at",
  p."updated_at"
FROM "video_projects" p
WHERE p."timeline" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- The same count and length summarizeTimeline (src/lib/video/timeline-schema.ts)
-- works out: every clip on every track, and where the last one ends.
UPDATE "video_project_videos" v
SET "clip_count" = s."clips", "duration_ms" = s."ends"
FROM (
  SELECT v2."id",
    count(c.clip)::int AS "clips",
    coalesce(max((c.clip ->> 'startMs')::numeric + (c.clip ->> 'durationMs')::numeric), 0)::int AS "ends"
  FROM "video_project_videos" v2
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(v2."timeline" -> 'tracks') = 'array' THEN v2."timeline" -> 'tracks' ELSE '[]'::jsonb END
  ) t(track) ON true
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(t.track -> 'clips') = 'array' THEN t.track -> 'clips' ELSE '[]'::jsonb END
  ) c(clip) ON true
  GROUP BY v2."id"
) s
WHERE s."id" = v."id";

UPDATE "video_project_videos" v
SET "language_of" = p."language_of"
FROM "video_projects" p
WHERE p."id" = v."id" AND p."language_of" IS NOT NULL AND v."language_of" IS NULL;

ALTER TABLE "video_projects" ALTER COLUMN "timeline" DROP NOT NULL;
ALTER TABLE "video_projects" ALTER COLUMN "aspect" DROP NOT NULL;

-- The video each person last had open in a project. `person` is a user id, or
-- "guest:" and the guest sign-in's id.
CREATE TABLE IF NOT EXISTS "video_project_last_videos" (
  "project_id" varchar(36) NOT NULL REFERENCES "video_projects" ("id") ON DELETE CASCADE,
  "person" varchar(48) NOT NULL,
  "video_id" varchar(36) NOT NULL REFERENCES "video_project_videos" ("id") ON DELETE CASCADE,
  "updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("project_id", "person")
);

-- Earlier timelines, exports, briefs and editor windows belong to one video.
-- Each keeps its project_id and gains the video's id, filled in with the
-- project's id, which is now its only video's id.
ALTER TABLE "video_project_versions" ADD COLUMN IF NOT EXISTS "video_id" varchar(36)
  REFERENCES "video_project_videos" ("id") ON DELETE CASCADE;
UPDATE "video_project_versions" SET "video_id" = "project_id" WHERE "video_id" IS NULL;
CREATE INDEX IF NOT EXISTS "ix_video_project_versions_video_created"
  ON "video_project_versions" ("video_id", "created_at");
DROP INDEX IF EXISTS "ix_video_project_versions_project_created";

ALTER TABLE "video_render_jobs" ADD COLUMN IF NOT EXISTS "video_id" varchar(36)
  REFERENCES "video_project_videos" ("id") ON DELETE CASCADE;
UPDATE "video_render_jobs" SET "video_id" = "project_id"
  WHERE "video_id" IS NULL AND "project_id" IS NOT NULL;
-- One export at a time per video and shape, where it was per project. Two
-- videos in one project can now export the same shape at once.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_render_jobs_video_aspect_active"
  ON "video_render_jobs" ("video_id", "aspect")
  WHERE "status" IN ('queued', 'running');
DROP INDEX IF EXISTS "ux_video_render_jobs_project_aspect_active";

ALTER TABLE "video_briefs" ADD COLUMN IF NOT EXISTS "video_id" varchar(36)
  REFERENCES "video_project_videos" ("id") ON DELETE CASCADE;
UPDATE "video_briefs" SET "video_id" = "project_id" WHERE "video_id" IS NULL;
CREATE INDEX IF NOT EXISTS "ix_video_briefs_video"
  ON "video_briefs" ("video_id", "created_at");
DROP INDEX IF EXISTS "ix_video_briefs_project";

ALTER TABLE "video_editor_windows" ADD COLUMN IF NOT EXISTS "video_id" varchar(36)
  REFERENCES "video_project_videos" ("id") ON DELETE CASCADE;
UPDATE "video_editor_windows" SET "video_id" = "project_id" WHERE "video_id" IS NULL;

-- The release before this one keeps writing these four tables for a minute
-- or two during the deploy, naming only a project. Every project it knows
-- of has one video with the same id, so a row it writes without a video_id
-- gets the project's id as its video_id here. That lets video_id be NOT NULL
-- from the start. The release after this one drops the trigger and function.
CREATE OR REPLACE FUNCTION "video_id_from_project"() RETURNS trigger AS $$
BEGIN
  IF NEW."video_id" IS NULL AND NEW."project_id" IS NOT NULL THEN
    NEW."video_id" := NEW."project_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "video_project_versions_video_id" ON "video_project_versions";
CREATE TRIGGER "video_project_versions_video_id" BEFORE INSERT ON "video_project_versions"
  FOR EACH ROW EXECUTE FUNCTION "video_id_from_project"();
DROP TRIGGER IF EXISTS "video_render_jobs_video_id" ON "video_render_jobs";
CREATE TRIGGER "video_render_jobs_video_id" BEFORE INSERT ON "video_render_jobs"
  FOR EACH ROW EXECUTE FUNCTION "video_id_from_project"();
DROP TRIGGER IF EXISTS "video_briefs_video_id" ON "video_briefs";
CREATE TRIGGER "video_briefs_video_id" BEFORE INSERT ON "video_briefs"
  FOR EACH ROW EXECUTE FUNCTION "video_id_from_project"();
DROP TRIGGER IF EXISTS "video_editor_windows_video_id" ON "video_editor_windows";
CREATE TRIGGER "video_editor_windows_video_id" BEFORE INSERT ON "video_editor_windows"
  FOR EACH ROW EXECUTE FUNCTION "video_id_from_project"();
ALTER TABLE "video_project_versions" ALTER COLUMN "video_id" SET NOT NULL;
ALTER TABLE "video_briefs" ALTER COLUMN "video_id" SET NOT NULL;
ALTER TABLE "video_editor_windows" ALTER COLUMN "video_id" SET NOT NULL;
ALTER TABLE "video_render_jobs" DROP CONSTRAINT IF EXISTS "video_render_jobs_video_check";
ALTER TABLE "video_render_jobs" ADD CONSTRAINT "video_render_jobs_video_check"
  CHECK ("kind" <> 'video' OR "video_id" IS NOT NULL);

-- An AI shot belongs to the whole project, and the video open when it was
-- asked for pays for it. Shots from before this were paid for by the
-- project's only video, which has the project's id. Deleting the video
-- blanks it, and the shot then counts toward no video.
ALTER TABLE "video_ai_generations" ADD COLUMN IF NOT EXISTS "video_id" varchar(36)
  REFERENCES "video_project_videos" ("id") ON DELETE SET NULL;
UPDATE "video_ai_generations" g SET "video_id" = g."project_id"
  WHERE g."video_id" IS NULL
    AND EXISTS (SELECT 1 FROM "video_project_videos" v WHERE v."id" = g."project_id");

-- One picture per video, where there was one per project. The old pictures
-- move across under the video that has the project's id.
CREATE TABLE IF NOT EXISTS "video_video_thumbnails" (
  "video_id" varchar(36) PRIMARY KEY REFERENCES "video_project_videos" ("id") ON DELETE CASCADE,
  "status" varchar(16) NOT NULL,
  "source_media_id" varchar(36),
  "source_at_ms" integer,
  "storage_path" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "error" text,
  "lease_token" varchar(36),
  "lease_expires_at" timestamptz,
  "checked_at" timestamptz NOT NULL,
  "generated_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_video_thumbnails_status_check"
    CHECK ("status" IN ('queued', 'generating', 'ready', 'error', 'none')),
  CONSTRAINT "video_video_thumbnails_ready_check"
    CHECK ("status" <> 'ready' OR "storage_path" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "ix_video_video_thumbnails_status"
  ON "video_video_thumbnails" ("status", "updated_at");
INSERT INTO "video_video_thumbnails" (
  "video_id", "status", "source_media_id", "source_at_ms", "storage_path",
  "attempts", "error", "lease_token", "lease_expires_at", "checked_at",
  "generated_at", "created_at", "updated_at"
)
SELECT
  t."project_id", t."status", t."source_media_id", t."source_at_ms", t."storage_path",
  t."attempts", t."error", NULL, NULL, t."checked_at",
  t."generated_at", t."created_at", t."updated_at"
FROM "video_project_thumbnails" t
JOIN "video_project_videos" v ON v."id" = t."project_id"
ON CONFLICT ("video_id") DO NOTHING;

-- AI spend is per video now (src/server/video/project-spend.ts), read off the
-- meter's `videoId`. Every meter row that named a project before this named
-- its only video too, which has the project's id, so it gets that videoId.
UPDATE "ai_usage_events" e
SET "metadata" = e."metadata" || jsonb_build_object('videoId', e."metadata" ->> 'projectId')
FROM "video_project_videos" v
WHERE e."metadata" ->> 'projectId' = v."id"
  AND NOT (e."metadata" ? 'videoId');
