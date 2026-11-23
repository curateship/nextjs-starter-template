-- The automation run engine: one row per time a flow was set going, and one row
-- per step it actually took.
--
-- Until now the canvas could draw a flow and prove it was structurally sound,
-- and nothing ever executed it. These two tables are what the in-process ticker
-- reads and writes fifteen seconds at a time.
--
-- Three ideas carry the whole design:
--
--   1. A run owns a *claim*, not a lock. A ticker takes a batch of due runs by
--      stamping its own `claim_token` on them, and only ever writes back to
--      rows still carrying that token. Two servers can tick at once and neither
--      can steal the other's work; a server that dies mid-run leaves a claim
--      that goes stale after five minutes and is simply picked up again.
--   2. The config is a *snapshot*. A run carries the compiled flow it started
--      with, so editing the flow tomorrow cannot rewrite what a run in flight
--      is doing, and the history still says what actually happened.
--   3. A parked run costs nothing. An approval checkpoint hands the claim back
--      and leaves `status = 'waiting_approval'`, which the claim query does not
--      look at — so a run can sit waiting for a human for days without holding
--      a slot, a connection or a lease.

CREATE TABLE IF NOT EXISTS "automation_runs" (
  "id" varchar(36) PRIMARY KEY,
  "automation_id" varchar(36) NOT NULL REFERENCES "automations"("id") ON DELETE CASCADE,
  -- Who the run belongs to. Copied from the flow rather than joined for it:
  -- the approval notice has to know who to ask without reading another table,
  -- and a flow's owner never changes.
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- 'active'           — due to run, or running right now
  -- 'waiting_approval' — parked at a checkpoint, claim handed back
  -- 'completed'        — reached the end
  -- 'failed'           — a step threw three times, or the flow is unrunnable
  -- 'rejected'         — a human said no, or nobody answered before the deadline
  "status" varchar(20) NOT NULL,
  -- Which step the run is on. Written after every step, so a crash resumes at
  -- the right place instead of starting the flow again.
  "current_node_id" varchar(64) NOT NULL,
  "config_snapshot" jsonb NOT NULL,
  -- When this run next wants attention. The claim query orders by it.
  "wake_at" timestamp with time zone NOT NULL,
  -- How many times the *current* step has been tried. Reset on every step that
  -- goes through, so one flaky step cannot spend a later step's retries.
  "attempts" integer NOT NULL DEFAULT 0,
  "claim_token" varchar(36),
  "claimed_at" timestamp with time zone,
  "error" text,
  -- The approval checkpoint, all five columns null until a run hits one.
  -- The node it is parked at, so a flow with two checkpoints can tell them
  -- apart, and the plain-words sentence the reviewer is shown.
  "approval_node_id" varchar(64),
  "approval_summary" text,
  "approval_deadline_at" timestamp with time zone,
  -- 'approved' | 'rejected' | 'timed_out'. Kept after the run moves on, so the
  -- history says which of the three ended it.
  "approval_decision" varchar(20),
  "approval_decided_at" timestamp with time zone,
  -- Null when the deadline decided it rather than a person. SET NULL rather
  -- than CASCADE: a deleted account must not take the record of what it
  -- approved with it.
  "approval_decided_by" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "automation_runs_status_check" CHECK (
    "status" IN ('active', 'waiting_approval', 'completed', 'failed', 'rejected')
  ),
  CONSTRAINT "automation_runs_decision_check" CHECK (
    "approval_decision" IS NULL
    OR "approval_decision" IN ('approved', 'rejected', 'timed_out')
  )
);

-- The claim query, exactly: due runs, oldest wake-up first.
CREATE INDEX IF NOT EXISTS "ix_automation_runs_status_wake"
  ON "automation_runs" ("status", "wake_at");

-- The runs list, newest first.
CREATE INDEX IF NOT EXISTS "ix_automation_runs_user_started"
  ON "automation_runs" ("user_id", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "ix_automation_runs_automation"
  ON "automation_runs" ("automation_id");

-- The deadline sweep: only ever asks about runs actually parked at a checkpoint.
CREATE INDEX IF NOT EXISTS "ix_automation_runs_approval_deadline"
  ON "automation_runs" ("approval_deadline_at")
  WHERE "status" = 'waiting_approval';

-- What each step did, in words. Append-only: a step row is written once, when
-- the step is over, and nothing edits it afterwards. A run in flight is
-- described by the run row; this is only ever history.
CREATE TABLE IF NOT EXISTS "automation_run_steps" (
  "id" varchar(36) PRIMARY KEY,
  "run_id" varchar(36) NOT NULL REFERENCES "automation_runs"("id") ON DELETE CASCADE,
  "node_id" varchar(64) NOT NULL,
  "kind" varchar(64) NOT NULL,
  -- 'completed' | 'failed' | 'rejected'. A rejected checkpoint is not a
  -- failure — somebody looked at it and said no — so it gets its own word.
  "status" varchar(20) NOT NULL,
  "attempts" integer NOT NULL DEFAULT 1,
  -- The one thing this table exists for: what the step did, said the way a
  -- person would say it. Every executor has to return one.
  "summary" text NOT NULL,
  "error" text,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone NOT NULL,
  CONSTRAINT "automation_run_steps_status_check" CHECK (
    "status" IN ('completed', 'failed', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS "ix_automation_run_steps_run"
  ON "automation_run_steps" ("run_id", "started_at");

-- The bell learns one more kind of notice: a run is waiting on you, and later
-- that nobody answered it in time.
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "automation_run_id" varchar(36)
    REFERENCES "automation_runs"("id") ON DELETE CASCADE;

-- 'pending' when the run parks, 'timed_out' when the deadline auto-rejects it.
-- Both are about the same run, so without this the two notices would read the
-- same and the second would look like a duplicate of the first.
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "automation_approval_state" varchar(20);

CREATE INDEX IF NOT EXISTS "ix_notifications_automation_run_id"
  ON "notifications" ("automation_run_id");

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK (
  "type" IN (
    'feedback_vote',
    'feedback_comment',
    'feedback_merged',
    'changelog',
    'announcement',
    'ai_limit_warning',
    'ai_limit_reached',
    'automation_approval'
  )
);
