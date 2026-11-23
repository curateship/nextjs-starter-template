-- Submissions, claims, owner edit requests, and what a site says about claiming.
--
-- Four tables, all new, all per site. Nothing existing is touched, so this
-- migration cannot change how a listing behaves today — every site starts with
-- no submissions, no claims and no settings row, which is exactly how the app
-- reads right now.
--
-- **The two-step status on a submission is the anti-spam design**, not
-- bookkeeping. A submission arrives as `pending_verification` and never appears
-- in the admin queue until somebody clicks the link in the email; only then is
-- it `pending_review`. An admin therefore never reads a queue full of addresses
-- nobody owns.
--
-- **The partial unique index on claims is the important line in this file.**
-- One approved claim per listing is a rule the database keeps, not one the
-- application remembers to check — two people both being told they own a public
-- page is not a race worth losing.

-- What the public asked for -----------------------------------------------------

CREATE TABLE IF NOT EXISTS "directory_submissions" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL,
  "business_name" varchar(200) NOT NULL,
  "contact_email" varchar(255) NOT NULL,
  "address" varchar(300) DEFAULT '' NOT NULL,
  "phone" varchar(60) DEFAULT '' NOT NULL,
  -- 2000, not 300: a maps or booking address is long, and a truncated one
  -- fails silently rather than loudly.
  "website" varchar(2000) DEFAULT '' NOT NULL,
  "description" varchar(2000) DEFAULT '' NOT NULL,
  "category_ids" jsonb NOT NULL,
  "status" varchar(30) DEFAULT 'pending_verification' NOT NULL,
  -- Hashed. The plain token exists only in the email that was sent.
  "verify_token_hash" varchar(128),
  "verify_expires_at" timestamp with time zone,
  "verified_at" timestamp with time zone,
  "reviewed_by_user_id" varchar(36),
  "reviewed_at" timestamp with time zone,
  "review_note" varchar(500) DEFAULT '' NOT NULL,
  "listing_id" varchar(36),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "directory_submissions_status_check"
    CHECK ("status" IN ('pending_verification', 'pending_review', 'approved', 'rejected'))
);

ALTER TABLE "directory_submissions"
  DROP CONSTRAINT IF EXISTS "directory_submissions_workspace_id_workspaces_id_fk";
ALTER TABLE "directory_submissions"
  ADD CONSTRAINT "directory_submissions_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

-- The reviewer is a caption, so the submission outlives the account that
-- reviewed it rather than disappearing with somebody who left.
ALTER TABLE "directory_submissions"
  DROP CONSTRAINT IF EXISTS "directory_submissions_reviewed_by_user_id_users_id_fk";
ALTER TABLE "directory_submissions"
  ADD CONSTRAINT "directory_submissions_reviewed_by_user_id_users_id_fk"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- What it became. Set null rather than cascade: deleting the listing an
-- approved submission produced must not erase the record that it was approved.
ALTER TABLE "directory_submissions"
  DROP CONSTRAINT IF EXISTS "directory_submissions_listing_id_directory_listings_id_fk";
ALTER TABLE "directory_submissions"
  ADD CONSTRAINT "directory_submissions_listing_id_directory_listings_id_fk"
  FOREIGN KEY ("listing_id") REFERENCES "directory_listings"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "ix_directory_submissions_workspace_status"
  ON "directory_submissions" ("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "ix_directory_submissions_workspace_created"
  ON "directory_submissions" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_directory_submissions_verify_token"
  ON "directory_submissions" ("verify_token_hash");

-- A business saying a listing is theirs ------------------------------------------

CREATE TABLE IF NOT EXISTS "directory_claims" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL,
  "listing_id" varchar(36) NOT NULL,
  "user_id" varchar(36) NOT NULL,
  "contact_email" varchar(255) NOT NULL,
  "claimant_name" varchar(200) NOT NULL,
  "role_title" varchar(120) DEFAULT '' NOT NULL,
  "phone" varchar(60) DEFAULT '' NOT NULL,
  "message" varchar(1000) DEFAULT '' NOT NULL,
  "proof_url" varchar(2000) DEFAULT '' NOT NULL,
  "email_domain_matches" boolean DEFAULT false NOT NULL,
  "status" varchar(30) DEFAULT 'pending_verification' NOT NULL,
  "verify_token_hash" varchar(128),
  "verify_expires_at" timestamp with time zone,
  "verified_at" timestamp with time zone,
  "reviewed_by_user_id" varchar(36),
  "reviewed_at" timestamp with time zone,
  "review_note" varchar(500) DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "directory_claims_status_check"
    CHECK ("status" IN ('pending_verification', 'pending_review', 'approved', 'rejected'))
);

ALTER TABLE "directory_claims"
  DROP CONSTRAINT IF EXISTS "directory_claims_workspace_id_workspaces_id_fk";
ALTER TABLE "directory_claims"
  ADD CONSTRAINT "directory_claims_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "directory_claims"
  DROP CONSTRAINT IF EXISTS "directory_claims_listing_id_directory_listings_id_fk";
ALTER TABLE "directory_claims"
  ADD CONSTRAINT "directory_claims_listing_id_directory_listings_id_fk"
  FOREIGN KEY ("listing_id") REFERENCES "directory_listings"("id") ON DELETE CASCADE;

-- The claim is the account's, so it goes when the account does. There is no
-- such thing as an owner with no owner.
ALTER TABLE "directory_claims"
  DROP CONSTRAINT IF EXISTS "directory_claims_user_id_users_id_fk";
ALTER TABLE "directory_claims"
  ADD CONSTRAINT "directory_claims_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "directory_claims"
  DROP CONSTRAINT IF EXISTS "directory_claims_reviewed_by_user_id_users_id_fk";
ALTER TABLE "directory_claims"
  ADD CONSTRAINT "directory_claims_reviewed_by_user_id_users_id_fk"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- One approved claim per listing. Rejected and pending ones are unlimited on
-- purpose: several people may ask, and only one may be told yes.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_directory_claims_approved_listing"
  ON "directory_claims" ("listing_id") WHERE "status" = 'approved';

CREATE INDEX IF NOT EXISTS "ix_directory_claims_workspace_status"
  ON "directory_claims" ("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "ix_directory_claims_user"
  ON "directory_claims" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "ix_directory_claims_verify_token"
  ON "directory_claims" ("verify_token_hash");

-- Changes an owner wants made ----------------------------------------------------

CREATE TABLE IF NOT EXISTS "directory_owner_edit_requests" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(36) NOT NULL,
  "claim_id" varchar(36) NOT NULL,
  "listing_id" varchar(36) NOT NULL,
  "changes" jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "reviewed_by_user_id" varchar(36),
  "reviewed_at" timestamp with time zone,
  "review_note" varchar(500) DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "directory_edit_requests_status_check"
    CHECK ("status" IN ('pending', 'approved', 'rejected'))
);

ALTER TABLE "directory_owner_edit_requests"
  DROP CONSTRAINT IF EXISTS "directory_owner_edit_requests_workspace_id_workspaces_id_fk";
ALTER TABLE "directory_owner_edit_requests"
  ADD CONSTRAINT "directory_owner_edit_requests_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "directory_owner_edit_requests"
  DROP CONSTRAINT IF EXISTS "directory_owner_edit_requests_claim_id_directory_claims_id_fk";
ALTER TABLE "directory_owner_edit_requests"
  ADD CONSTRAINT "directory_owner_edit_requests_claim_id_directory_claims_id_fk"
  FOREIGN KEY ("claim_id") REFERENCES "directory_claims"("id") ON DELETE CASCADE;

ALTER TABLE "directory_owner_edit_requests"
  DROP CONSTRAINT IF EXISTS "directory_owner_edit_requests_listing_id_directory_listings_id_fk";
ALTER TABLE "directory_owner_edit_requests"
  ADD CONSTRAINT "directory_owner_edit_requests_listing_id_directory_listings_id_fk"
  FOREIGN KEY ("listing_id") REFERENCES "directory_listings"("id") ON DELETE CASCADE;

ALTER TABLE "directory_owner_edit_requests"
  DROP CONSTRAINT IF EXISTS "directory_owner_edit_requests_reviewed_by_user_id_users_id_fk";
ALTER TABLE "directory_owner_edit_requests"
  ADD CONSTRAINT "directory_owner_edit_requests_reviewed_by_user_id_users_id_fk"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "ix_directory_edit_requests_workspace_status"
  ON "directory_owner_edit_requests" ("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "ix_directory_edit_requests_listing"
  ON "directory_owner_edit_requests" ("listing_id");

-- What a site says about claiming -------------------------------------------------
--
-- One row per site, and no site has one until an admin saves. Every reader
-- defaults to today's behaviour, so this table being empty is the normal state
-- rather than a missing setup step.

CREATE TABLE IF NOT EXISTS "directory_settings" (
  "workspace_id" varchar(36) PRIMARY KEY NOT NULL,
  "claims_enabled" boolean DEFAULT true NOT NULL,
  "claim_button_label" varchar(80) DEFAULT '' NOT NULL,
  "claim_pending_message" varchar(300) DEFAULT '' NOT NULL,
  "claim_approved_message" varchar(300) DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "directory_settings"
  DROP CONSTRAINT IF EXISTS "directory_settings_workspace_id_workspaces_id_fk";
ALTER TABLE "directory_settings"
  ADD CONSTRAINT "directory_settings_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
