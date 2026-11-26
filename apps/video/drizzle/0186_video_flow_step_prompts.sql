-- Each video its own prompts (workspace/tasks/flow/03-each-video-its-own-prompts.md).
-- A flow is a channel and a run is one video of it: the node's prompt on the
-- canvas says how every video is built, and each run's step holds this one
-- video's prompt beside it. Additions only.
--
--   video_prompt          This video's words for the step, as last sent or as
--                         the AI suggested them. Empty until either happens.
--   video_prompt_from_ai  The words are the AI's suggestion as it wrote them.
--                         Made again from new words above it, an AI-written
--                         prompt is dropped and written afresh; words the
--                         person wrote are kept.
ALTER TABLE "video_flow_run_steps" ADD COLUMN IF NOT EXISTS "video_prompt" text;
ALTER TABLE "video_flow_run_steps" ADD COLUMN IF NOT EXISTS "video_prompt_from_ai" boolean NOT NULL DEFAULT false;
