-- Approval checkpoint: a run can park at a Wait for Approval step until the
-- owner approves or rejects it. A parked run holds no worker lease, so it can
-- wait for days without blocking the queue.

-- Run + step statuses gain 'waiting_approval'.
ALTER TABLE "automation_runs"
  DROP CONSTRAINT IF EXISTS "automation_runs_status_check";
ALTER TABLE "automation_runs"
  ADD CONSTRAINT "automation_runs_status_check"
  CHECK ("status" IN ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'canceled'));

ALTER TABLE "automation_run_steps"
  DROP CONSTRAINT IF EXISTS "automation_run_steps_status_check";
ALTER TABLE "automation_run_steps"
  ADD CONSTRAINT "automation_run_steps_status_check"
  CHECK ("status" IN ('pending', 'running', 'waiting_approval', 'completed', 'failed', 'skipped'));

-- A run waiting for approval is still the automation's one active run, so the
-- partial unique index has to count it too.
DROP INDEX IF EXISTS "ux_automation_runs_automation_active";
CREATE UNIQUE INDEX IF NOT EXISTS "ux_automation_runs_automation_active"
  ON "automation_runs" ("automation_id")
  WHERE "status" IN ('queued', 'running', 'waiting_approval');

-- Approval metadata on the step that parked the run.
ALTER TABLE "automation_run_steps"
  ADD COLUMN IF NOT EXISTS "approval_deadline_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "approval_decision" varchar(20),
  ADD COLUMN IF NOT EXISTS "approval_decided_at" timestamptz;

ALTER TABLE "automation_run_steps"
  DROP CONSTRAINT IF EXISTS "automation_run_steps_approval_decision_check";
ALTER TABLE "automation_run_steps"
  ADD CONSTRAINT "automation_run_steps_approval_decision_check"
  CHECK ("approval_decision" IS NULL
    OR "approval_decision" IN ('approved', 'rejected', 'timed_out'));

-- Drives the timeout sweep on the worker tick.
CREATE INDEX IF NOT EXISTS "ix_automation_run_steps_approval_deadline"
  ON "automation_run_steps" ("approval_deadline_at")
  WHERE "status" = 'waiting_approval';

-- Bell notification for "this run needs your decision" and for the auto-reject
-- that fires when nobody answered in time.
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "automation_run_id" varchar(36)
    REFERENCES "automation_runs"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "automation_approval_state" varchar(20);

ALTER TABLE "notifications"
  DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" IN ('feedback_vote', 'feedback_comment', 'creator_watch',
    'api_usage_alert', 'automation_approval'));

ALTER TABLE "notifications"
  DROP CONSTRAINT IF EXISTS "notifications_automation_approval_state_check";
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_automation_approval_state_check"
  CHECK ("automation_approval_state" IS NULL
    OR "automation_approval_state" IN ('pending', 'timed_out'));

CREATE INDEX IF NOT EXISTS "ix_notifications_automation_run_id"
  ON "notifications" ("automation_run_id");
