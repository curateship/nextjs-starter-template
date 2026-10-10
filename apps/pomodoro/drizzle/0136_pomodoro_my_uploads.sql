-- My uploads (uploads-and-sharing task 02, 10 Oct 2026).
--
-- `deleted_at` is the 30-day bin. A deleted upload keeps its files and rows,
-- is hidden everywhere a member could pick or play it, and still counts
-- toward their space (Tyler's choice, 10 Oct 2026). Bring back clears it; a
-- worker pass removes for good what has sat there 30 days.
--
-- `still_path` is where a video's middle frame sits in the bucket, under
-- `pomodoro-stills/`, so a grid of clips loads pictures rather than films.
-- That folder is outside the per-member folders the storage page's orphan
-- sweep looks in, so a still with no library row of its own is never swept;
-- the upload's own delete removes it.
ALTER TABLE "pomodoro_media_uploads"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "still_path" varchar(300);

CREATE INDEX IF NOT EXISTS "pomodoro_media_uploads_deleted_idx"
  ON "pomodoro_media_uploads" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;

-- One row while a member's space is at or over 90% of their limit and the
-- bell has said so. It goes when they drop back under, so the next climb
-- warns again.
CREATE TABLE IF NOT EXISTS "pomodoro_storage_warnings" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "warned_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- AI files made before this were named after their stored file
-- ("Rain on a tin roof at night.mp3"). They take the prompt itself, cut to 80
-- characters at a word break, the way new ones are named. A name a member
-- already changed is left alone.
UPDATE "pomodoro_media_uploads" AS upload
-- A prompt with no break in its first 81 characters is cut at 80, and the
-- outer left() keeps every result inside the 80-character column.
SET "name" = left(COALESCE(
  NULLIF(
    CASE
      WHEN length(btrim(generation."prompt")) <= 80 THEN btrim(generation."prompt")
      WHEN left(btrim(generation."prompt"), 81) ~ '\s'
        THEN regexp_replace(left(btrim(generation."prompt"), 81), '\s+\S*$', '')
      ELSE left(btrim(generation."prompt"), 80)
    END,
    ''
  ),
  left(btrim(generation."prompt"), 80)
), 80)
FROM "pomodoro_generations" AS generation, "media" AS media
WHERE generation."media_id" = upload."media_id"
  AND media."id" = upload."media_id"
  AND (upload."name" IS NULL OR upload."name" = left(media."original_name", 80));
