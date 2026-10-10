-- The upload window (uploads-and-sharing task 01, 10 Oct 2026). A member names
-- an upload, tags it, ticks whether to share it, and may trim a sound or clip
-- before it goes up.
--
-- `name` is what the card shows. Rows from before this get the library row's
-- file name, so an old upload still reads "IMG_4021.mp4". It stays nullable
-- because a server still running the old code during a deploy writes rows
-- without it, and the list reads the file name for those.
--
-- `shared` is only stored here. What it shows to other people is task 03.
--
-- `trim_start_ms` and `trim_end_ms` are where the member wants a sound or clip
-- to start and end. The whole file is uploaded and the worker cuts it while it
-- re-encodes. Both are empty when nothing was trimmed.
ALTER TABLE "pomodoro_media_uploads"
  ADD COLUMN IF NOT EXISTS "name" varchar(80),
  ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "shared" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "trim_start_ms" integer,
  ADD COLUMN IF NOT EXISTS "trim_end_ms" integer;

DO $$ BEGIN
  ALTER TABLE "pomodoro_media_uploads" ADD CONSTRAINT "pomodoro_media_uploads_trim_check"
    CHECK (
      ("trim_start_ms" IS NULL AND "trim_end_ms" IS NULL)
      OR ("trim_start_ms" >= 0 AND "trim_end_ms" > "trim_start_ms")
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE "pomodoro_media_uploads" AS upload
SET "name" = left(media."original_name", 80)
FROM "media" AS media
WHERE media."id" = upload."media_id" AND upload."name" IS NULL;
