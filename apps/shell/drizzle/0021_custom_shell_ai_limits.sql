-- Monthly AI limits. Each plan can carry an allowance in dollars a month
-- (the free-form "aiDollars" key on plans.features — no schema change), and
-- one person can be given their own number instead. The tables here are the
-- two things that DO need storing: the per-person override, and a record of
-- which warnings have already been sent so a burst of calls cannot send the
-- same one twice.

-- One row per person who has their own allowance instead of their plan's.
-- No row means "follow the plan". monthly_cents can be zero, which is a real
-- ceiling of nothing — an account that may not use AI at all.
CREATE TABLE IF NOT EXISTS "ai_allowance_overrides" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "monthly_cents" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ai_allowance_overrides_cents_check" CHECK ("monthly_cents" >= 0)
);

-- One row per warning actually sent: this person, this month, this level.
-- The unique index is the whole point — ten calls crossing 80% at the same
-- moment all try to insert the same row, one wins, and only the winner sends
-- the notification. The counter resets on the 1st because the month is part
-- of the key.
CREATE TABLE IF NOT EXISTS "ai_usage_alerts" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "month_start" date NOT NULL,
  "level" varchar(20) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ai_usage_alerts_level_check"
    CHECK ("level" in ('warning', 'reached'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_ai_usage_alerts_user_month_level"
  ON "ai_usage_alerts" ("user_id", "month_start", "level");

-- The warnings arrive as ordinary notifications, which means two new kinds.
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" in (
    'feedback_vote', 'feedback_comment', 'changelog', 'announcement',
    'ai_limit_warning', 'ai_limit_reached'
  ));
