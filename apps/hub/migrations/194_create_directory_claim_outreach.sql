-- Claim outreach: admin-initiated invitations asking the business behind an
-- unclaimed listing to claim it, with a link that lands in the claim flow for
-- that exact listing. One row per send attempt (the outreach log) powers the
-- history column and the resend cooldown. Opt-outs live in a separate table so
-- a recipient's unsubscribe survives even if the listing (and its outreach
-- rows) is later deleted. Mirrors directory_submissions (193) in style.

DO $$ BEGIN
  CREATE TYPE directory_claim_outreach_status_enum AS ENUM ('sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS directory_claim_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  directory_id UUID NOT NULL REFERENCES directory(id) ON DELETE CASCADE,
  -- The business contact email the invitation was sent to (stored lowercased).
  to_email VARCHAR(255) NOT NULL,
  status directory_claim_outreach_status_enum NOT NULL,
  -- Populated only for failed sends, for the admin to diagnose.
  error TEXT,
  -- The super-admin who triggered the send (SET NULL if that user is removed).
  sent_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Newest send per listing: powers the resend-cooldown check and "last invited".
CREATE INDEX IF NOT EXISTS idx_directory_claim_outreach_directory_created
  ON directory_claim_outreach (directory_id, created_at DESC);

-- Per-site history, newest first.
CREATE INDEX IF NOT EXISTS idx_directory_claim_outreach_site_created
  ON directory_claim_outreach (site_id, created_at DESC, id);

-- Recipients who opted out of claim outreach for a site. Suppression is
-- per-site, per-email; the email is always stored lowercased.
CREATE TABLE IF NOT EXISTS directory_claim_outreach_optouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_claim_outreach_optouts_site_email
  ON directory_claim_outreach_optouts (site_id, email);
