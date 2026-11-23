-- AI video shots longer than one clip.
--
-- Google's Veo stops one clip at 8 seconds. A longer shot is made of 8 second
-- pieces, one row each, and every piece starts from the last frame of the
-- piece before it. The pieces of one shot share `shot_id`, which is the first
-- piece's own id, and `shot_index` counts them from 1 to `shot_pieces`.
--
-- Every row already here is a shot of one piece, so it becomes its own shot.
--
-- A piece after the first is 'waiting' until the one before it is ready. It
-- is not in the one-active-per-project index, so a shot's later pieces can
-- sit behind its running piece.
ALTER TABLE "video_ai_generations" ADD COLUMN IF NOT EXISTS "shot_id" varchar(36);
ALTER TABLE "video_ai_generations" ADD COLUMN IF NOT EXISTS "shot_index" integer;
ALTER TABLE "video_ai_generations" ADD COLUMN IF NOT EXISTS "shot_pieces" integer;
UPDATE "video_ai_generations"
  SET "shot_id" = "id", "shot_index" = 1, "shot_pieces" = 1
  WHERE "shot_id" IS NULL;
ALTER TABLE "video_ai_generations" ALTER COLUMN "shot_id" SET NOT NULL;
ALTER TABLE "video_ai_generations" ALTER COLUMN "shot_index" SET NOT NULL;
ALTER TABLE "video_ai_generations" ALTER COLUMN "shot_pieces" SET NOT NULL;

ALTER TABLE "video_ai_generations" DROP CONSTRAINT IF EXISTS "video_ai_generations_shot_check";
ALTER TABLE "video_ai_generations" ADD CONSTRAINT "video_ai_generations_shot_check"
  CHECK ("shot_pieces" BETWEEN 1 AND 4 AND "shot_index" BETWEEN 1 AND "shot_pieces");

ALTER TABLE "video_ai_generations" DROP CONSTRAINT IF EXISTS "video_ai_generations_status_check";
ALTER TABLE "video_ai_generations" ADD CONSTRAINT "video_ai_generations_status_check"
  CHECK ("status" IN ('waiting', 'queued', 'processing', 'ready', 'error'));

CREATE INDEX IF NOT EXISTS "ix_video_ai_generations_shot"
  ON "video_ai_generations" ("shot_id", "shot_index");
