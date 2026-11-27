-- A project's look: one style line every AI picture and clip made for the
-- project starts from, and one picture in the media library whose look is
-- copied. Both are set in the project's Settings window on the projects list.
--
-- They sit beside the timeline rather than inside it, the way the name does,
-- so changing the look never moves "version" and never refuses the next save
-- of an editor that has the project open. Deleting the picture blanks
-- "style_media_id"; the style line stays.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "style" varchar(500);
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "style_media_id" varchar(36)
  REFERENCES "media" ("id") ON DELETE SET NULL;

-- For a few hours on 12 Oct 2026 a build kept the look inside the timeline
-- document, as "style" and "styleMediaId". A timeline holding either no longer
-- passes the editor's check, so any look kept that way moves into the new
-- columns. A picture id only moves when the picture is still the owner's.
UPDATE "video_projects" AS project
SET
  "style" = NULLIF(btrim(project."timeline" ->> 'style'), ''),
  "style_media_id" = (
    SELECT media."id" FROM "media" AS media
    WHERE media."id" = project."timeline" ->> 'styleMediaId'
      AND media."user_id" = project."user_id"
  ),
  "timeline" = project."timeline" - 'style' - 'styleMediaId'
WHERE project."timeline" ? 'style' OR project."timeline" ? 'styleMediaId';
