-- What a Flow step remembers between the worker's passes
-- (workspace/tasks/flow/02-pomodoro-flow.md, part 9): the AI editor's plan and
-- price, whether the person pressed OK on it, and each file it makes (a music
-- track, a loop) written down as soon as it is paid for, so a pass cut short
-- never pays for the same thing twice (workspace/docs/flow.md).

ALTER TABLE "video_flow_run_steps" ADD COLUMN IF NOT EXISTS "state" jsonb;
