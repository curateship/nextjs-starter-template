ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "referral_code" varchar(32)
  DEFAULT replace(gen_random_uuid()::text, '-', '');

UPDATE "users"
SET "referral_code" = replace(gen_random_uuid()::text, '-', '')
WHERE "referral_code" IS NULL;

ALTER TABLE "users"
  ALTER COLUMN "referral_code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ux_users_referral_code"
  ON "users" ("referral_code");

CREATE TABLE IF NOT EXISTS "referrals" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "referrer_user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "referred_user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "referrer_name" varchar(255) NOT NULL,
  "referrer_email" varchar(255) NOT NULL,
  "referred_name" varchar(255) NOT NULL,
  "referred_email" varchar(255) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'invited',
  "reward_status" varchar(20) NOT NULL DEFAULT 'not_earned',
  "stripe_invoice_id" varchar(120),
  "stripe_payment_intent_id" varchar(120),
  "reward_amount_cents" integer,
  "reward_currency" varchar(10),
  "stripe_customer_id" varchar(120),
  "stripe_balance_transaction_id" varchar(120),
  "created_at" timestamp with time zone NOT NULL,
  "joined_at" timestamp with time zone,
  "converted_at" timestamp with time zone,
  "granted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "referrals_status_check"
    CHECK ("status" IN ('invited', 'joined', 'converted')),
  CONSTRAINT "referrals_reward_status_check"
    CHECK ("reward_status" IN ('not_earned', 'pending', 'granted', 'revoked')),
  CONSTRAINT "referrals_reward_amount_check"
    CHECK ("reward_amount_cents" IS NULL OR "reward_amount_cents" > 0),
  CONSTRAINT "referrals_progress_check" CHECK (
    ("status" = 'invited' AND "joined_at" IS NULL AND "converted_at" IS NULL AND "reward_status" = 'not_earned')
    OR
    ("status" = 'joined' AND "joined_at" IS NOT NULL AND "converted_at" IS NULL AND "reward_status" = 'not_earned')
    OR
    ("status" = 'converted' AND "joined_at" IS NOT NULL AND "converted_at" IS NOT NULL AND "reward_status" IN ('pending', 'granted', 'revoked'))
  ),
  CONSTRAINT "referrals_grant_check" CHECK (
    "reward_status" <> 'granted'
    OR (
      "reward_amount_cents" IS NOT NULL
      AND "reward_currency" IS NOT NULL
      AND "stripe_customer_id" IS NOT NULL
      AND "stripe_balance_transaction_id" IS NOT NULL
      AND "granted_at" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_referrals_referred_user"
  ON "referrals" ("referred_user_id")
  WHERE "referred_user_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ux_referrals_stripe_invoice"
  ON "referrals" ("stripe_invoice_id")
  WHERE "stripe_invoice_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ix_referrals_referrer_created"
  ON "referrals" ("referrer_user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "ix_referrals_reward_status"
  ON "referrals" ("reward_status", "converted_at" DESC);

CREATE INDEX IF NOT EXISTS "ix_referrals_payment_intent"
  ON "referrals" ("stripe_payment_intent_id")
  WHERE "stripe_payment_intent_id" IS NOT NULL;
