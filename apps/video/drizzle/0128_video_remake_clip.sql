-- Regenerate a scene in place (task ai-generation/07-regenerate-a-scene-in-place).
--
-- Make it again on a moving clip asks for a new shot that takes that clip's
-- place, the same way Make it move swaps a picture (drizzle/0126). A shot for
-- a picture started on that picture, so first_frame_media_id said both what
-- the shot starts on and which file the clip had to still be showing for the
-- shot to land. A clip made again starts on the picture it was first made
-- from, while the clip shows the moving shot made from it, so the two now
-- need a column each:
--
--   clip_media_id  The file the clip showed when the shot was asked for. The
--                  shot lands only while the clip still shows it; a clip
--                  deleted or given another file meanwhile leaves the shot
--                  in Media, as before.
--
-- Shots asked for before this were all for pictures, so each one's file is
-- its first piece's starting picture.
ALTER TABLE "video_ai_generations"
  ADD COLUMN IF NOT EXISTS "clip_media_id" varchar(36);

UPDATE "video_ai_generations" AS "piece"
SET "clip_media_id" = "first"."first_frame_media_id"
FROM "video_ai_generations" AS "first"
WHERE "piece"."clip_id" IS NOT NULL
  AND "piece"."clip_media_id" IS NULL
  AND "first"."shot_id" = "piece"."shot_id"
  AND "first"."shot_index" = 1;
