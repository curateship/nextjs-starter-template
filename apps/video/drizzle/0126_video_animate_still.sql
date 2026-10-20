-- Animate a still where it sits (task ai-generation/06-animate-a-still-where-it-sits).
--
-- Right-clicking a picture clip on the timeline and pressing Make it move
-- writes an AI shot whose first frame is that picture, not a first frame made
-- in the AI clip panel. When the shot is ready it replaces the picture in the
-- same place on the same lane.
--
-- What such a shot records:
--
--   clip_id           The timeline clip it is for, so it can find the picture
--                     wherever the project now has it.
--   clip_start_ms     Where the picture started and how long it ran when Make
--   clip_duration_ms  it move was pressed. The length decided how long a shot
--                     to ask for.
--   clip_outcome      Null until the shot has landed. 'replaced' once the
--                     moving shot took the picture's place, 'gone' when the
--                     picture had been deleted or swapped for another file
--                     meanwhile, in which case the shot waits on the
--                     project's Media panel instead.
--
-- Such a shot has no first frame row, so first_frame_id may now be null, and
-- only on a shot that names a clip. Every row written before this one was made
-- in the AI clip panel: it keeps its first frame and has nulls in the four new
-- columns, so it reads and inserts exactly as before.
ALTER TABLE "video_ai_generations"
  ALTER COLUMN "first_frame_id" DROP NOT NULL;

ALTER TABLE "video_ai_generations"
  ADD COLUMN IF NOT EXISTS "clip_id" varchar(64),
  ADD COLUMN IF NOT EXISTS "clip_start_ms" double precision,
  ADD COLUMN IF NOT EXISTS "clip_duration_ms" double precision,
  ADD COLUMN IF NOT EXISTS "clip_outcome" varchar(8);

ALTER TABLE "video_ai_generations"
  DROP CONSTRAINT IF EXISTS "video_ai_generations_clip_check";
ALTER TABLE "video_ai_generations"
  ADD CONSTRAINT "video_ai_generations_clip_check" CHECK (
    ("clip_id" IS NULL AND "clip_start_ms" IS NULL AND "clip_duration_ms" IS NULL AND "clip_outcome" IS NULL)
    OR ("clip_id" IS NOT NULL AND "clip_start_ms" IS NOT NULL AND "clip_duration_ms" IS NOT NULL)
  );

ALTER TABLE "video_ai_generations"
  DROP CONSTRAINT IF EXISTS "video_ai_generations_source_check";
ALTER TABLE "video_ai_generations"
  ADD CONSTRAINT "video_ai_generations_source_check" CHECK (
    "first_frame_id" IS NOT NULL OR "clip_id" IS NOT NULL
  );

ALTER TABLE "video_ai_generations"
  DROP CONSTRAINT IF EXISTS "video_ai_generations_clip_outcome_check";
ALTER TABLE "video_ai_generations"
  ADD CONSTRAINT "video_ai_generations_clip_outcome_check" CHECK (
    "clip_outcome" IS NULL OR "clip_outcome" IN ('replaced', 'gone')
  );

-- The worker looks for ready shots that have not landed on every pass.
CREATE INDEX IF NOT EXISTS "ix_video_ai_generations_unlanded"
  ON "video_ai_generations" ("project_id")
  WHERE "clip_id" IS NOT NULL AND "clip_outcome" IS NULL;
