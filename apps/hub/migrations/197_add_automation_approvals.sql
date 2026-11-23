-- Approval gate for node automations.
--
-- A run can now stop part-way through at an Approval node and wait for the site
-- owner to approve or reject before the rest of that branch runs. That turns the
-- run lifecycle from "start -> finish in one process" into "start -> pause ->
-- resume on a later cron invocation", so three things change:
--
-- 1. Runs and run steps gain the waiting / rejected / expired states.
-- 2. A new table holds each pending gate: the payload the gate is holding for the
--    downstream nodes, the deadline, and the decision once one is made.
-- 3. Hub notifications gain an 'automation_approval' type for the "needs your OK"
--    message that points the owner at the paused automation.

ALTER TABLE site_automation_runs
  DROP CONSTRAINT IF EXISTS site_automation_runs_status_check;
ALTER TABLE site_automation_runs
  ADD CONSTRAINT site_automation_runs_status_check
  CHECK (status IN ('running', 'waiting', 'success', 'partial', 'failed', 'noop', 'rejected', 'expired'));

ALTER TABLE site_automations
  DROP CONSTRAINT IF EXISTS site_automations_last_run_status_check;
ALTER TABLE site_automations
  ADD CONSTRAINT site_automations_last_run_status_check
  CHECK (last_run_status IS NULL OR last_run_status IN ('running', 'waiting', 'success', 'partial', 'failed', 'noop', 'rejected', 'expired'));

ALTER TABLE site_automation_run_steps
  DROP CONSTRAINT IF EXISTS site_automation_run_steps_status_check;
ALTER TABLE site_automation_run_steps
  ADD CONSTRAINT site_automation_run_steps_status_check
  CHECK (status IN ('pending', 'running', 'waiting', 'success', 'failed', 'skipped', 'rejected', 'expired'));

CREATE TABLE IF NOT EXISTS site_automation_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES site_automation_runs(id) ON DELETE CASCADE,
  -- Denormalised from the run so the cron sweep can lock the automation without
  -- joining, and so a decision can be authorised against the owning site cheaply.
  automation_id UUID NOT NULL REFERENCES site_automations(id) ON DELETE CASCADE,
  node_id VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- The runtime value the gate is holding for the nodes after it. Written when the
  -- run pauses and cleared the moment it is consumed (or the gate is closed), so a
  -- generated article body is never kept around longer than the pause itself.
  payload JSONB,
  -- Safe, display-only fields for the approval card (title, excerpt, word count).
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  decided_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT site_automation_approvals_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired'))
);

-- One gate per node per run: a re-run creates a new run, so this also stops a
-- retry from opening a second approval against the same paused step. Its leading
-- run_id column is also what the editor's "approvals for these runs" lookup uses,
-- so no separate run_id index is needed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_automation_approvals_run_node
  ON site_automation_approvals(run_id, node_id);
-- Drives both cron sweeps: resume the approved ones, expire the overdue pending ones.
CREATE INDEX IF NOT EXISTS idx_site_automation_approvals_status_expires
  ON site_automation_approvals(status, expires_at);

ALTER TABLE hub_notifications
  DROP CONSTRAINT IF EXISTS hub_notifications_type_check;
ALTER TABLE hub_notifications
  ADD CONSTRAINT hub_notifications_type_check
  CHECK (type IN ('product_order', 'directory_claim', 'directory_owner_edit', 'directory_featured', 'newsletter_paused', 'directory_featured_expired', 'event_submission', 'directory_submission', 'event_registration', 'automation_approval'));
