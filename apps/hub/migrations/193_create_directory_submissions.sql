-- Public "Add your listing" submissions feeding an admin approval queue.
-- A visitor submits a business; we email them a verification link; once they
-- confirm, the submission enters the review queue; approving it creates a real,
-- template-conformant PUBLISHED directory listing. Mirrors event_submissions
-- (192) plus the directory_claims email-verification columns (token hash +
-- expiry) so nothing reaches a reviewer until the submitter proves their email.

DO $$ BEGIN
  CREATE TYPE directory_submission_status_enum AS ENUM ('pending_email', 'pending_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS directory_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  status directory_submission_status_enum NOT NULL DEFAULT 'pending_email',
  business_name VARCHAR(255) NOT NULL,
  address VARCHAR(500),
  description TEXT,
  image_url TEXT,
  -- The email we verify AND publish as the listing's contact link on approval.
  contact_email VARCHAR(255) NOT NULL,
  contact_email_verified_at TIMESTAMPTZ,
  -- Only the SHA-256 hash of the verification token is stored; both null after use.
  verification_token_hash TEXT,
  verification_token_expires_at TIMESTAMPTZ,
  -- The category the submitter picked (validated to a published child category on submit).
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  -- Set when approved: the listing this submission created (SET NULL if the
  -- listing is later deleted, keeping the submission as an audit record).
  created_directory_id UUID REFERENCES directory(id) ON DELETE SET NULL,
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Powers the admin queue (per-site, per-status, newest first).
CREATE INDEX IF NOT EXISTS idx_directory_submissions_site_status_created
  ON directory_submissions (site_id, status, created_at DESC, id);

-- Powers the email-verification lookup (verify?token=...).
CREATE INDEX IF NOT EXISTS idx_directory_submissions_token_hash
  ON directory_submissions (verification_token_hash);

-- Add the new hub-notification type so "new listing submission" alerts validate.
ALTER TABLE hub_notifications DROP CONSTRAINT IF EXISTS hub_notifications_type_check;
ALTER TABLE hub_notifications ADD CONSTRAINT hub_notifications_type_check
  CHECK (type IN ('product_order','directory_claim','directory_owner_edit','directory_featured','newsletter_paused','directory_featured_expired','event_submission','directory_submission'));
