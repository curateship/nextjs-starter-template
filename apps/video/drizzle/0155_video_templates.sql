-- Templates (workspace/tasks/templates/01-templates.md,
-- workspace/docs/templates.md). Additions only.

-- A template: a person's saved instructions for the AI, used on any of their
-- videos. Everything the AI follows sits in "fields", one JSON object read
-- through templateFieldsSchema (src/lib/video/templates.ts), so a field added
-- later needs no migration. The name, tags and pin are columns because the
-- list sorts and filters by them.
--
--   starter   Which of the three starter templates this row began as, or
--             NULL for one the person made. Only a label: editing a starter
--             is the same as editing any template.
CREATE TABLE IF NOT EXISTS "video_templates" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "fields" jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "pinned_at" timestamp with time zone,
  "starter" varchar(40),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_video_templates_user"
  ON "video_templates" ("user_id", "updated_at");

-- When a person's three starter templates were made. One row per person, so
-- deleting all three never brings them back.
CREATE TABLE IF NOT EXISTS "video_template_starts" (
  "user_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL
);

-- A brief made from a template keeps a copy of it as it was, so editing or
-- deleting the template never changes a brief already written.
--
--   template_id        The template it was made from. Deleting the template
--                      blanks this; the copy stays.
--   template           The copy: the template's name and fields, with this
--                      video's one-off changes already applied.
--   source             What was in the script box. NULL on a brief written
--                      from the old brief window.
--   finish             What happened after the last scene landed: the
--                      language copies. NULL until then.
ALTER TABLE "video_briefs" ADD COLUMN IF NOT EXISTS "template_id" varchar(36)
  REFERENCES "video_templates"("id") ON DELETE SET NULL;
ALTER TABLE "video_briefs" ADD COLUMN IF NOT EXISTS "template" jsonb;
ALTER TABLE "video_briefs" ADD COLUMN IF NOT EXISTS "source" jsonb;
ALTER TABLE "video_briefs" ADD COLUMN IF NOT EXISTS "finish" jsonb;

CREATE INDEX IF NOT EXISTS "ix_video_briefs_template"
  ON "video_briefs" ("template_id", "created_at");

-- What the Templates panel's "This video" card holds for a video before and
-- after Brief to video: the template picked, what is in the script box, and
-- the changes made for this video only. The intro and outro are the
-- template's own, written when the video is made; an export uses them before
-- the project's (workspace/docs/intro-and-outro.md).
ALTER TABLE "video_project_videos" ADD COLUMN IF NOT EXISTS "template_id" varchar(36)
  REFERENCES "video_templates"("id") ON DELETE SET NULL;
ALTER TABLE "video_project_videos" ADD COLUMN IF NOT EXISTS "template_script" text;
ALTER TABLE "video_project_videos" ADD COLUMN IF NOT EXISTS "template_changes" jsonb;
ALTER TABLE "video_project_videos" ADD COLUMN IF NOT EXISTS "intro_media_id" varchar(36)
  REFERENCES "media"("id") ON DELETE SET NULL;
ALTER TABLE "video_project_videos" ADD COLUMN IF NOT EXISTS "outro_media_id" varchar(36)
  REFERENCES "media"("id") ON DELETE SET NULL;
