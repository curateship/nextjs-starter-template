-- Saved listings, paid Featured placement, and claim-outreach history.
--
-- Saves and paid placement belong to a site. An outreach opt-out deliberately
-- does not: saying stop on one directory means the address is never contacted
-- by another directory in this deployment.

CREATE TABLE IF NOT EXISTS "directory_save_collections" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_save_collections_site_user_name"
  ON "directory_save_collections" ("workspace_id", "user_id", lower("name"));
CREATE INDEX IF NOT EXISTS "ix_directory_save_collections_user_created"
  ON "directory_save_collections" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "directory_save_items" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "collection_id" varchar(36) NOT NULL REFERENCES "directory_save_collections"("id") ON DELETE CASCADE,
  "listing_id" varchar(36) NOT NULL REFERENCES "directory_listings"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_save_items_collection_listing"
  ON "directory_save_items" ("collection_id", "listing_id");
CREATE INDEX IF NOT EXISTS "ix_directory_save_items_site_listing"
  ON "directory_save_items" ("workspace_id", "listing_id");
CREATE INDEX IF NOT EXISTS "ix_directory_save_items_user_created"
  ON "directory_save_items" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "directory_featured_plans" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "description" varchar(500) DEFAULT '' NOT NULL,
  "price_cents" integer NOT NULL,
  "currency" varchar(3) DEFAULT 'usd' NOT NULL,
  "duration_days" integer NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "directory_featured_plans_price_check" CHECK ("price_cents" > 0),
  CONSTRAINT "directory_featured_plans_duration_check" CHECK ("duration_days" BETWEEN 1 AND 3650)
);
CREATE INDEX IF NOT EXISTS "ix_directory_featured_plans_site_active"
  ON "directory_featured_plans" ("workspace_id", "active", "created_at");

CREATE TABLE IF NOT EXISTS "directory_featured_entitlements" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "listing_id" varchar(36) NOT NULL REFERENCES "directory_listings"("id") ON DELETE CASCADE,
  "claim_id" varchar(36) NOT NULL REFERENCES "directory_claims"("id") ON DELETE CASCADE,
  "buyer_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "plan_id" varchar(36) NOT NULL REFERENCES "directory_featured_plans"("id") ON DELETE RESTRICT,
  "stripe_session_id" varchar(255) NOT NULL,
  "stripe_payment_intent_id" varchar(255),
  "amount_total" integer NOT NULL,
  "currency" varchar(3) NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "reminder_threshold_days" integer,
  "reminder_claimed_at" timestamp with time zone,
  "revoked_by_user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "revoked_at" timestamp with time zone,
  "revoke_note" varchar(500) DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "directory_featured_entitlements_status_check" CHECK ("status" IN ('active', 'revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_featured_entitlements_session"
  ON "directory_featured_entitlements" ("stripe_session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_featured_entitlements_payment_intent"
  ON "directory_featured_entitlements" ("stripe_payment_intent_id")
  WHERE "stripe_payment_intent_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "ix_directory_featured_entitlements_listing_active"
  ON "directory_featured_entitlements" ("workspace_id", "listing_id", "status", "ends_at");

CREATE TABLE IF NOT EXISTS "directory_claim_outreach" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "listing_id" varchar(36) NOT NULL REFERENCES "directory_listings"("id") ON DELETE CASCADE,
  "to_email" varchar(255) NOT NULL,
  "status" varchar(20) NOT NULL,
  "error" varchar(500) DEFAULT '' NOT NULL,
  "sent_by_user_id" varchar(36) REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "directory_claim_outreach_status_check" CHECK ("status" IN ('sending', 'sent', 'failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_claim_outreach_listing_email"
  ON "directory_claim_outreach" ("listing_id", "to_email");
CREATE INDEX IF NOT EXISTS "ix_directory_claim_outreach_site_created"
  ON "directory_claim_outreach" ("workspace_id", "created_at");

CREATE TABLE IF NOT EXISTS "directory_claim_outreach_opt_outs" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_claim_outreach_opt_out_email"
  ON "directory_claim_outreach_opt_outs" (lower("email"));
