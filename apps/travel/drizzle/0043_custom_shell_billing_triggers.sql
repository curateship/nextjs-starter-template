-- Billing moment triggers: the first flows that start by themselves.
--
-- Until now a flow only ever ran because somebody pressed Run. Three things are
-- needed before an event can start one, and all three are here.

-- 1. A flow says whether it is live.
--
-- Off for every flow that already exists, and off for every new one. A trigger
-- that fired the moment the canvas happened to compile would send real email to
-- real people while somebody was still drawing the thing — so switching it on
-- is a decision, made once, out loud. Pressing Run by hand is untouched by
-- this: that is a person standing there asking for it.
ALTER TABLE "automations"
  ADD COLUMN IF NOT EXISTS "enabled" boolean NOT NULL DEFAULT false;

-- Which flows a firing event has to look at. Tiny table, but this is read on
-- every billing webhook and every scan, and it is only ever the live ones.
CREATE INDEX IF NOT EXISTS "ix_automations_enabled"
  ON "automations" ("enabled")
  WHERE "enabled";

-- 2. A run can be about somebody.
--
-- `subject_user_id` is who it is about, which is never the same person as
-- `user_id` — that is the admin who owns the flow.
--
-- The account going away must not take the history of what was done to them
-- with it, so the reference is ON DELETE SET NULL and `subject_label` holds the
-- name and address as they read at the time. That copy is the only thing the
-- run history can show once the account is gone, and it is a copy on purpose:
-- a renamed person's old runs still say what was true when they ran.
ALTER TABLE "automation_runs"
  ADD COLUMN IF NOT EXISTS "subject_user_id" varchar(36)
    REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "subject_label" varchar(200),
  -- The node kind that started it, so the history can name the moment.
  ADD COLUMN IF NOT EXISTS "trigger_kind" varchar(64),
  -- The once-per guard: the one thing this run was started for. A failed
  -- invoice, one trial's end date, one card in one billing period.
  ADD COLUMN IF NOT EXISTS "trigger_key" varchar(200),
  -- What happened, in the plain values the steps after the trigger read: the
  -- amount, the date, the last four digits. Never card details beyond those.
  ADD COLUMN IF NOT EXISTS "trigger_facts" jsonb;

-- The guard itself, and the whole reason a webhook delivered twice, a scan run
-- twice, or two servers scanning at the same moment cannot start the same flow
-- for the same person twice. Partial, so the runs somebody started by hand —
-- which have no key — are not forced to be unique against anything.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_automation_runs_trigger_key"
  ON "automation_runs" ("automation_id", "trigger_key")
  WHERE "trigger_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ix_automation_runs_subject"
  ON "automation_runs" ("subject_user_id");

-- 3. Something to remember when a periodic look last happened.
--
-- Two of the three billing moments are not webhooks — a trial ending and a card
-- running out are dates passing, which nothing tells us about. They are found by
-- looking, and looking has a cost: the card check asks Stripe about every paying
-- member, so it must happen once a day rather than four times a minute.
--
-- One row per kind of look. The update is conditional on the row being old
-- enough, so two servers ticking at the same instant cannot both take the scan:
-- the first one's write moves the timestamp and the second one matches nothing.
CREATE TABLE IF NOT EXISTS "automation_trigger_scans" (
  "kind" varchar(64) PRIMARY KEY,
  "last_scanned_at" timestamptz NOT NULL
);
