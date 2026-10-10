-- One-off purchases for Pro members (uploads-and-sharing task 07, 10 Oct
-- 2026): a pack of AI credits, or 10 GB more space for a year. Tyler's
-- prices that day: 5 backgrounds for $5, 20 soundscapes for $3, 10 GB for a
-- year for $5.
--
-- A row is written when the member presses Buy, before Stripe is asked, so
-- the checkout session always has a row to come back to. It is paid once
-- Stripe says so (on the way back, or by the purchases worker if the member
-- never came back), and refunded when Stripe says the charge was refunded,
-- which takes back what it bought.
CREATE TABLE IF NOT EXISTS "pomodoro_purchases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "product" varchar(30) NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'usd',
  "stripe_session_id" varchar(255) UNIQUE,
  "stripe_payment_intent_id" varchar(255),
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "paid_at" timestamp with time zone,
  -- Space only: when the extra 10 GB stops counting.
  "ends_at" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  -- When the worker last asked Stripe about it, so it asks each row rarely.
  "checked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pomodoro_purchases_product_check"
    CHECK ("product" IN ('backgrounds_5', 'soundscapes_20', 'space_10gb')),
  CONSTRAINT "pomodoro_purchases_status_check"
    CHECK ("status" IN ('pending', 'paid', 'refunded', 'expired')),
  CONSTRAINT "pomodoro_purchases_amount_check" CHECK ("amount_cents" > 0)
);

CREATE INDEX IF NOT EXISTS "pomodoro_purchases_user_idx"
  ON "pomodoro_purchases" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "pomodoro_purchases_check_idx"
  ON "pomodoro_purchases" ("status", "checked_at");

-- What has been spent from bought credits, per member and kind. Bought
-- credits never reset: what is left is every paid pack's credits less
-- `reserved - refunded`, the same rule as the monthly ledger.
CREATE TABLE IF NOT EXISTS "pomodoro_pack_usage" (
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "reserved" integer NOT NULL DEFAULT 0,
  "completed" integer NOT NULL DEFAULT 0,
  "refunded" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "kind"),
  CONSTRAINT "pomodoro_pack_usage_kind_check"
    CHECK ("kind" IN ('background', 'soundscape')),
  CONSTRAINT "pomodoro_pack_usage_counts_check"
    CHECK ("reserved" >= 0 AND "completed" >= 0 AND "refunded" >= 0)
);

-- Which pot a request's credit came from, so a failure refunds that pot.
ALTER TABLE "pomodoro_generations"
  ADD COLUMN IF NOT EXISTS "pot" varchar(10) NOT NULL DEFAULT 'month';
ALTER TABLE "pomodoro_generations"
  DROP CONSTRAINT IF EXISTS "pomodoro_generations_pot_check";
ALTER TABLE "pomodoro_generations"
  ADD CONSTRAINT "pomodoro_generations_pot_check" CHECK ("pot" IN ('month', 'pack'));
