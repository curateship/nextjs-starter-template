-- Carousel projects hold many carousels (workspace/tasks/projects/
-- 01-projects-hold-many.md, section B; workspace/docs/carousel-project-carousels.md).
-- Built the way video projects hold videos (0145): a project table, and each
-- carousel carries its project's id.
--
-- `video_carousels.project_id` keeps its meaning, "made from this video
-- project" (0138). The container is the new `carousel_project_id`.
--
-- Every person with carousels gets one carousel project, "My carousels",
-- holding all of them.
--
-- The deploy rule (docs/deployment.md, "Why that order matters"): the release
-- before this one keeps running for a minute or two beside the new database.
--   * It inserts carousels without a carousel project. The trigger
--     carousel_project_for_carousel puts each in that person's last edited
--     carousel project, making "My carousels" if they have none.
--   * It writes uploads to video_carousel_media, one shelf per carousel. The
--     trigger carousel_media_to_project copies each into the project's shelf,
--     video_carousel_project_media, which this release reads.
-- The release after this one drops video_carousel_media and both triggers.

-- Folders for carousel projects, kept the way Viral's projects keep theirs:
-- the folder is a column on the project.
CREATE TABLE IF NOT EXISTS "video_carousel_project_folders" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_video_carousel_project_folders_user_id"
  ON "video_carousel_project_folders" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_carousel_project_folders_user_name"
  ON "video_carousel_project_folders" ("user_id", lower("name"));

CREATE TABLE IF NOT EXISTS "video_carousel_projects" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  -- What a new carousel in the project starts with: font, colours, text
  -- style and slide background. Empty means the app's own starting look.
  "look" jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Put at the end of a new carousel's caption, such as hashtags.
  "caption_footer" text NOT NULL DEFAULT '',
  -- Deleting the folder leaves the project in none.
  "folder_id" varchar(36) REFERENCES "video_carousel_project_folders" ("id") ON DELETE SET NULL,
  "pinned_at" timestamptz,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_video_carousel_projects_user_updated"
  ON "video_carousel_projects" ("user_id", "updated_at");
CREATE INDEX IF NOT EXISTS "ix_video_carousel_projects_folder"
  ON "video_carousel_projects" ("folder_id") WHERE "folder_id" IS NOT NULL;

ALTER TABLE "video_carousels"
  ADD COLUMN IF NOT EXISTS "carousel_project_id" varchar(36)
    REFERENCES "video_carousel_projects" ("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "status" varchar(8) NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "pinned_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;
DO $$ BEGIN
  ALTER TABLE "video_carousels" ADD CONSTRAINT "video_carousels_status_check"
    CHECK ("status" IN ('draft', 'ready', 'posted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One "My carousels" per person with carousels, then every carousel into it.
INSERT INTO "video_carousel_projects" ("id", "user_id", "name", "created_at", "updated_at")
SELECT gen_random_uuid()::text, c."user_id", 'My carousels', min(c."created_at"), max(c."updated_at")
FROM "video_carousels" c
WHERE c."carousel_project_id" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "video_carousel_projects" p WHERE p."user_id" = c."user_id"
  )
GROUP BY c."user_id";

UPDATE "video_carousels" c
SET "carousel_project_id" = (
  SELECT p."id" FROM "video_carousel_projects" p
  WHERE p."user_id" = c."user_id"
  ORDER BY p."created_at", p."id"
  LIMIT 1
)
WHERE c."carousel_project_id" IS NULL;

-- A carousel the release before this one inserts goes into that person's
-- last edited carousel project, or a new "My carousels".
CREATE OR REPLACE FUNCTION "carousel_project_for_carousel"() RETURNS trigger AS $$
DECLARE
  picked varchar(36);
BEGIN
  IF NEW."carousel_project_id" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT p."id" INTO picked FROM "video_carousel_projects" p
  WHERE p."user_id" = NEW."user_id" AND p."archived_at" IS NULL
  ORDER BY p."updated_at" DESC, p."id"
  LIMIT 1;
  IF picked IS NULL THEN
    picked := gen_random_uuid()::text;
    INSERT INTO "video_carousel_projects" ("id", "user_id", "name", "created_at", "updated_at")
    VALUES (picked, NEW."user_id", 'My carousels', now(), now());
  END IF;
  NEW."carousel_project_id" := picked;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "video_carousels_carousel_project" ON "video_carousels";
CREATE TRIGGER "video_carousels_carousel_project" BEFORE INSERT ON "video_carousels"
  FOR EACH ROW EXECUTE FUNCTION "carousel_project_for_carousel"();

ALTER TABLE "video_carousels" ALTER COLUMN "carousel_project_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_video_carousels_carousel_project_updated"
  ON "video_carousels" ("carousel_project_id", "updated_at");

-- Which carousel each person last had open in each carousel project, so
-- opening the project opens it again. `person` is the user's id.
CREATE TABLE IF NOT EXISTS "video_carousel_project_last_carousels" (
  "project_id" varchar(36) NOT NULL REFERENCES "video_carousel_projects" ("id") ON DELETE CASCADE,
  "person" varchar(80) NOT NULL,
  "carousel_id" varchar(36) NOT NULL REFERENCES "video_carousels" ("id") ON DELETE CASCADE,
  "updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("project_id", "person")
);

-- One picture shelf per carousel project, joined from each carousel's shelf.
CREATE TABLE IF NOT EXISTS "video_carousel_project_media" (
  "project_id" varchar(36) NOT NULL REFERENCES "video_carousel_projects" ("id") ON DELETE CASCADE,
  "media_id" varchar(36) NOT NULL REFERENCES "media" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("project_id", "media_id")
);
CREATE INDEX IF NOT EXISTS "ix_video_carousel_project_media_media_id"
  ON "video_carousel_project_media" ("media_id");

INSERT INTO "video_carousel_project_media" ("project_id", "media_id", "created_at")
SELECT c."carousel_project_id", m."media_id", min(m."created_at")
FROM "video_carousel_media" m
JOIN "video_carousels" c ON c."id" = m."carousel_id"
GROUP BY c."carousel_project_id", m."media_id"
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION "carousel_media_to_project"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "video_carousel_project_media" ("project_id", "media_id", "created_at")
  SELECT c."carousel_project_id", NEW."media_id", NEW."created_at"
  FROM "video_carousels" c WHERE c."id" = NEW."carousel_id"
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "video_carousel_media_to_project" ON "video_carousel_media";
CREATE TRIGGER "video_carousel_media_to_project" AFTER INSERT ON "video_carousel_media"
  FOR EACH ROW EXECUTE FUNCTION "carousel_media_to_project"();
