-- AI-made backgrounds and soundscapes.
--
-- Two tables. The ledger counts what each person has spent this month, and the
-- queue holds one row per request from the moment it is asked for until a file
-- exists. They are separate because the credit is spent when the request is
-- accepted, not when the file arrives: a member must not be able to queue
-- twenty videos while the first is still rendering.

-- One row per person, per month, per kind. `reserved - refunded` is what has
-- been spent, so a refund gives the credit back without losing the record that
-- the attempt happened.
CREATE TABLE IF NOT EXISTS "pomodoro_generation_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- The first of the month, as a date, so a month is one comparable value.
  "month" date NOT NULL,
  "kind" varchar(20) NOT NULL,
  "reserved" integer NOT NULL DEFAULT 0,
  "completed" integer NOT NULL DEFAULT 0,
  "refunded" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pomodoro_generation_usage_kind_check"
    CHECK ("kind" IN ('background', 'soundscape')),
  CONSTRAINT "pomodoro_generation_usage_counts_check"
    CHECK ("reserved" >= 0 AND "completed" >= 0 AND "refunded" >= 0),
  CONSTRAINT "pomodoro_generation_usage_unique"
    UNIQUE ("user_id", "month", "kind")
);

-- One row per request. `media_id` stays null until the file exists, which is
-- why this cannot live on pomodoro_media_uploads: that table is keyed by a
-- library row, and for most of a generation's life there is not one yet.
CREATE TABLE IF NOT EXISTS "pomodoro_generations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "prompt" varchar(500) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  -- The month the credit was taken from, so a refund goes back to the same
  -- month even when the job finishes after midnight on the first.
  "month" date NOT NULL,
  "media_id" varchar(36) REFERENCES "media"("id") ON DELETE SET NULL,
  "failure_reason" varchar(200),
  "attempts" integer NOT NULL DEFAULT 0,
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pomodoro_generations_kind_check"
    CHECK ("kind" IN ('background', 'soundscape')),
  CONSTRAINT "pomodoro_generations_status_check"
    CHECK ("status" IN ('queued', 'running', 'ready', 'failed'))
);

-- The generator panel's read: this person's requests of one kind, newest last.
CREATE INDEX IF NOT EXISTS "pomodoro_generations_user_kind_idx"
  ON "pomodoro_generations" ("user_id", "kind", "created_at");

-- The worker's read: the oldest request still waiting.
CREATE INDEX IF NOT EXISTS "pomodoro_generations_status_created_idx"
  ON "pomodoro_generations" ("status", "created_at");
