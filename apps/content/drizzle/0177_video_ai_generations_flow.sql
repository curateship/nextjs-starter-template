-- A Flow run can animate a picture into a loop before it is saved into a
-- project (workspace/tasks/flow/02-pomodoro-flow.md, part 6). Such a shot
-- belongs to no project yet, and to the Flow step that asked for it, whose
-- cost then counts its meter rows (workspace/docs/flow.md).
--
-- The shots-at-once trigger (0117) needs no change: a shot with no project
-- counts toward no project's 3 (NULL = NULL is never true), and still toward
-- the person's 6.

ALTER TABLE "video_ai_generations" ALTER COLUMN "project_id" DROP NOT NULL;

-- Deleting a run deletes its shots' rows (the files they made stay in
-- Media, their cost on the meter); emptying the link instead would break the
-- source check below.
ALTER TABLE "video_ai_generations"
  ADD COLUMN IF NOT EXISTS "flow_step_id" varchar(36)
  REFERENCES "video_flow_run_steps"("id") ON DELETE CASCADE;

-- A shot comes from a first frame (an actor's), a picture on a clip (Make
-- it move), or now a Flow step's picture, which sits on no clip.
ALTER TABLE "video_ai_generations"
  DROP CONSTRAINT IF EXISTS "video_ai_generations_source_check";
ALTER TABLE "video_ai_generations"
  ADD CONSTRAINT "video_ai_generations_source_check" CHECK (
    "first_frame_id" IS NOT NULL OR "clip_id" IS NOT NULL OR "flow_step_id" IS NOT NULL
  );
