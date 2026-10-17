-- SaaS foundation: verified accounts, roles, plans, subscriptions, billing.
--
-- scripts/setup-database.mjs replays every file in this folder on each predev,
-- so all DDL here is IF NOT EXISTS and every one-time data patch is recorded in
-- "migration_state". Without that guard a replay would re-verify freshly
-- registered users and resurrect plans or navigation an admin deleted.

CREATE TABLE IF NOT EXISTS "migration_state" (
  "key" text PRIMARY KEY NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- users ----------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verified_at'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;
    -- Accounts that predate email verification stay able to sign in.
    UPDATE "users" SET "email_verified_at" = now();
  END IF;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active' NOT NULL;

UPDATE "users" SET "role" = 'member' WHERE "role" NOT IN ('admin', 'member');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_role_check" CHECK ("role" in ('admin', 'member'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_status_check" CHECK ("status" in ('active', 'suspended'));
  END IF;
END $$;

-- auth tokens ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL,
  "purpose" varchar(20) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "auth_tokens_purpose_check"
    CHECK ("purpose" in ('verify_email', 'reset_password'))
);

CREATE INDEX IF NOT EXISTS "ix_auth_tokens_user_purpose"
  ON "auth_tokens" ("user_id", "purpose");
CREATE INDEX IF NOT EXISTS "ix_auth_tokens_expires_at"
  ON "auth_tokens" ("expires_at");

-- rate limits ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" varchar(200) PRIMARY KEY NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "blocked_until" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL
);

-- plans ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "plans" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "slug" varchar(50) NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "price_monthly_cents" integer DEFAULT 0 NOT NULL,
  "price_yearly_cents" integer DEFAULT 0 NOT NULL,
  "currency" varchar(10) DEFAULT 'usd' NOT NULL,
  "stripe_price_id_monthly" varchar(120),
  "stripe_price_id_yearly" varchar(120),
  "trial_days" integer DEFAULT 0 NOT NULL,
  "features" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_public" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "plans_slug_unique" UNIQUE("slug"),
  CONSTRAINT "plans_prices_check"
    CHECK ("price_monthly_cents" >= 0 AND "price_yearly_cents" >= 0),
  CONSTRAINT "plans_trial_days_check" CHECK ("trial_days" >= 0)
);

-- Exactly one plan is the fallback for everyone without a paid subscription.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_plans_single_default"
  ON "plans" ("is_default") WHERE "is_default";
CREATE UNIQUE INDEX IF NOT EXISTS "ux_plans_stripe_price_monthly"
  ON "plans" ("stripe_price_id_monthly") WHERE "stripe_price_id_monthly" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ux_plans_stripe_price_yearly"
  ON "plans" ("stripe_price_id_yearly") WHERE "stripe_price_id_yearly" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_plans_sort_order" ON "plans" ("sort_order");

-- subscriptions --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "plan_id" varchar(36) REFERENCES "plans"("id") ON DELETE SET NULL,
  "stripe_customer_id" varchar(120),
  "stripe_subscription_id" varchar(120),
  "status" varchar(30) NOT NULL,
  "interval" varchar(10) DEFAULT 'monthly' NOT NULL,
  "source" varchar(10) DEFAULT 'stripe' NOT NULL,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "trial_ends_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id"),
  CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
  CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
  CONSTRAINT "subscriptions_interval_check"
    CHECK ("interval" in ('monthly', 'yearly')),
  CONSTRAINT "subscriptions_source_check"
    CHECK ("source" in ('stripe', 'manual'))
);

CREATE INDEX IF NOT EXISTS "ix_subscriptions_plan_id" ON "subscriptions" ("plan_id");
CREATE INDEX IF NOT EXISTS "ix_subscriptions_status" ON "subscriptions" ("status");

-- billing events -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "billing_events" (
  "event_id" varchar(120) PRIMARY KEY NOT NULL,
  "type" varchar(120) NOT NULL,
  "processed_at" timestamp with time zone NOT NULL
);

-- admin audit logs -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "actor_user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "action" varchar(50) NOT NULL,
  "resource" varchar(30) NOT NULL,
  "record_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "detail" text,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_admin_audit_logs_actor_created"
  ON "admin_audit_logs" ("actor_user_id", "created_at");

-- seed plans -----------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "migration_state" WHERE "key" = '0004_seed_plans') THEN
    INSERT INTO "plans" (
      "id", "slug", "name", "description", "price_monthly_cents",
      "price_yearly_cents", "features", "is_default", "is_public", "sort_order",
      "created_at", "updated_at"
    )
    VALUES
      (
        gen_random_uuid()::text, 'free', 'Free',
        'Everything you need to get started.', 0, 0,
        '{"support": "community"}'::jsonb, true, true, 0, now(), now()
      ),
      (
        gen_random_uuid()::text, 'pro', 'Pro',
        'For people who use this every day.', 1900,
        19000, '{"support": "priority"}'::jsonb, false, true, 1, now(), now()
      );

    INSERT INTO "migration_state" ("key") VALUES ('0004_seed_plans');
  END IF;
END $$;

-- workspace navigation -------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "migration_state" WHERE "key" = '0004_workspace_account_nav'
  ) THEN
    UPDATE "workspaces"
    SET "settings" = jsonb_set(
      "settings",
      '{sections}',
      '[
        {"id":"section-account","title":"Account","entries":[
          {"type":"item","id":"item-account","label":"Account","href":"/account","icon":"user-round","visible":true},
          {"type":"item","id":"item-account-billing","label":"Billing","href":"/account/billing","icon":"credit-card","visible":true},
          {"type":"item","id":"item-account-security","label":"Security","href":"/account/security","icon":"shield-check","visible":true}
        ]},
        {"id":"section-administration","title":"Administration","entries":[
          {"type":"item","id":"item-admin-users","label":"Users","href":"/admin/users","icon":"users","visible":true,"roles":["admin"]},
          {"type":"item","id":"item-admin-plans","label":"Plans","href":"/admin/plans","icon":"package","visible":true,"roles":["admin"]},
          {"type":"item","id":"item-admin-revenue","label":"Revenue","href":"/admin/billing","icon":"barChart3","visible":true,"roles":["admin"]}
        ]}
      ]'::jsonb || COALESCE("settings"->'sections', '[]'::jsonb)
    ),
    "updated_at" = now()
    WHERE NOT ("settings"->'sections' @> '[{"id":"section-account"}]'::jsonb);

    INSERT INTO "migration_state" ("key") VALUES ('0004_workspace_account_nav');
  END IF;
END $$;
