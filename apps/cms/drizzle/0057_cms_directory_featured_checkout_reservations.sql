-- One durable reservation makes parallel Featured checkout starts reuse the
-- same Stripe idempotency key and protects plans while payment is in flight.

CREATE TABLE "directory_featured_checkouts" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "listing_id" varchar(36) NOT NULL REFERENCES "directory_listings"("id") ON DELETE CASCADE,
  "claim_id" varchar(36) NOT NULL REFERENCES "directory_claims"("id") ON DELETE CASCADE,
  "buyer_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "plan_id" varchar(36) NOT NULL REFERENCES "directory_featured_plans"("id") ON DELETE RESTRICT,
  "price_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL,
  "duration_days" integer NOT NULL,
  "product_name" varchar(400) NOT NULL,
  "customer_email" varchar(255) NOT NULL,
  "success_url" varchar(2000) NOT NULL,
  "cancel_url" varchar(2000) NOT NULL,
  "stripe_session_id" varchar(255),
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "directory_featured_checkouts_status_check"
    CHECK ("status" IN ('pending', 'completed', 'expired'))
);

CREATE UNIQUE INDEX "ux_directory_featured_checkouts_pending_listing"
  ON "directory_featured_checkouts" ("workspace_id", "listing_id")
  WHERE "status" = 'pending';
CREATE UNIQUE INDEX "ux_directory_featured_checkouts_session"
  ON "directory_featured_checkouts" ("stripe_session_id");
CREATE INDEX "ix_directory_featured_checkouts_plan"
  ON "directory_featured_checkouts" ("plan_id");
