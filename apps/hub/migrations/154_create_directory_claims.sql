DO $$
BEGIN
  CREATE TYPE directory_claim_status_enum AS ENUM (
    'pending_email',
    'pending_review',
    'approved',
    'rejected',
    'revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS directory_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  directory_id UUID NOT NULL REFERENCES directory(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status directory_claim_status_enum NOT NULL DEFAULT 'pending_email',
  business_email VARCHAR(255) NOT NULL,
  business_email_verified_at TIMESTAMPTZ,
  verification_token_hash TEXT,
  verification_token_expires_at TIMESTAMPTZ,
  claimant_name VARCHAR(255),
  role_title VARCHAR(120),
  phone VARCHAR(80),
  message TEXT,
  proof_url TEXT,
  domain_matches BOOLEAN NOT NULL DEFAULT false,
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_claims_directory_user
  ON directory_claims(directory_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_claims_one_approved_per_directory
  ON directory_claims(directory_id)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_directory_claims_site_status_created
  ON directory_claims(site_id, status, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_directory_claims_directory_status
  ON directory_claims(directory_id, status);

CREATE INDEX IF NOT EXISTS idx_directory_claims_token_hash
  ON directory_claims(verification_token_hash);
