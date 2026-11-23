-- An actor with more than one picture (task features/35, built as part 3 of
-- features/42, the character sheet).
--
-- Until now an actor was one picture, `video_actors.image_media_id`, and every
-- first frame was drawn from it alone, so a character drifted from video to
-- video. This table is the actor's sheet: several pictures of the same person
-- (Front, Side, Full body, Smiling), each an ordinary Media file.
--
-- The main picture stays where it was, in `video_actors.image_media_id`, so
-- the actor cards, the actor image route and the projects list keep reading
-- the same column. The app keeps that file on the sheet too: making an actor,
-- re-posing one and picking a new main picture all write the sheet row in the
-- same transaction, and removing the main picture is refused until another is
-- picked.
--
-- What deleting removes:
--
--   Removing a picture from the sheet deletes this row only. The file stays
--   in Media, the same as deleting an actor always has.
--   Deleting the actor deletes its sheet rows (cascade), never the files.
--   Deleting a file from Media takes it off any sheet (cascade). The main
--   picture cannot be deleted that way, because `video_actors.image_media_id`
--   still restricts it.
--
-- `label` is optional and free text. One file sits on one actor's sheet at
-- most once.
CREATE TABLE IF NOT EXISTS "video_actor_sheet_pictures" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "actor_id" varchar(36) NOT NULL REFERENCES "video_actors"("id") ON DELETE CASCADE,
  "media_id" varchar(36) NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
  "label" varchar(60),
  "created_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_video_actor_sheet_pictures_actor_media"
  ON "video_actor_sheet_pictures" ("actor_id", "media_id");
CREATE INDEX IF NOT EXISTS "ix_video_actor_sheet_pictures_actor_created"
  ON "video_actor_sheet_pictures" ("actor_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_video_actor_sheet_pictures_media_id"
  ON "video_actor_sheet_pictures" ("media_id");

-- Every actor that exists starts with a one-picture sheet: its main picture,
-- unlabelled, dated when the actor was made. md5 gives each row a stable id of
-- the right length without needing an extension, and the conflict clause makes
-- a second run add nothing.
INSERT INTO "video_actor_sheet_pictures" ("id", "user_id", "actor_id", "media_id", "label", "created_at")
SELECT
  substr(md5('sheet:' || a."id"), 1, 8) || '-' ||
  substr(md5('sheet:' || a."id"), 9, 4) || '-' ||
  substr(md5('sheet:' || a."id"), 13, 4) || '-' ||
  substr(md5('sheet:' || a."id"), 17, 4) || '-' ||
  substr(md5('sheet:' || a."id"), 21, 12),
  a."user_id",
  a."id",
  a."image_media_id",
  NULL,
  a."created_at"
FROM "video_actors" a
ON CONFLICT ("actor_id", "media_id") DO NOTHING;

-- Which of the actor's pictures a first frame was drawn from, as Media ids in
-- the order they were sent (the main picture first when it was picked). A
-- list of ids rather than links to sheet rows, so the record still says what
-- was sent after a picture is taken off the sheet. Frames made before this
-- migration hold an empty list: which picture they used was never written
-- down, and the actor's main picture may have changed since.
ALTER TABLE "video_first_frames"
  ADD COLUMN IF NOT EXISTS "actor_media_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
