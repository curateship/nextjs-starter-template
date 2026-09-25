-- The AI meter: one row per AI call — who ran it, which feature, which model,
-- tokens in and out, and the cost in whole cents from the price list in
-- src/lib/ai-models.ts. Failed and blocked calls are recorded too, so the
-- answer to "why was the bill $340" is always one query away.
--
-- user_id is NOT cascaded: deleting an account must not erase what it spent,
-- so its rows go anonymous (null) instead. month_start is the first day of
-- the UTC month the call belongs to, computed only by aiUsageMonthStart in
-- src/server/ai-usage.ts. The two indexes match how the usage dashboard task
-- will read this: per person per month, and a month in time order.
CREATE TABLE IF NOT EXISTS "ai_usage_events" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "provider" varchar(20) NOT NULL,
  "model" varchar(120) NOT NULL,
  "feature" varchar(50) NOT NULL,
  "input_tokens" integer NOT NULL,
  "output_tokens" integer NOT NULL,
  "cost_cents" integer NOT NULL,
  "status" varchar(20) NOT NULL,
  "month_start" date NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ai_usage_events_status_check"
    CHECK ("status" in ('success', 'failed', 'blocked'))
);

CREATE INDEX IF NOT EXISTS "ix_ai_usage_events_user_month"
  ON "ai_usage_events" ("user_id", "month_start");
CREATE INDEX IF NOT EXISTS "ix_ai_usage_events_month_created"
  ON "ai_usage_events" ("month_start", "created_at");
