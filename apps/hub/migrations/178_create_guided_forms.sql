CREATE TABLE IF NOT EXISTS guided_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  slug varchar(100) NOT NULL,
  headline varchar(255) NOT NULL DEFAULT 'Tell us what you need',
  subhead text NOT NULL DEFAULT 'Answer a few quick questions and we will route you to the right next step.',
  status varchar(20) NOT NULL DEFAULT 'draft',
  contact_sync_enabled boolean NOT NULL DEFAULT false,
  admin_notification_enabled boolean NOT NULL DEFAULT false,
  admin_notification_email varchar(255),
  draft_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft_outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guided_forms_site_slug
  ON guided_forms(site_id, slug);

CREATE INDEX IF NOT EXISTS idx_guided_forms_site_status
  ON guided_forms(site_id, status);

CREATE TABLE IF NOT EXISTS guided_form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES guided_forms(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  headline varchar(255) NOT NULL,
  subhead text NOT NULL DEFAULT '',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guided_form_versions_form_number
  ON guided_form_versions(form_id, version_number);

CREATE INDEX IF NOT EXISTS idx_guided_form_versions_form_published
  ON guided_form_versions(form_id, published_at);

CREATE TABLE IF NOT EXISTS guided_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES guided_forms(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES guided_form_versions(id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL DEFAULT 'completed',
  contact_email varchar(255),
  matched_outcome_id varchar(100),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guided_form_submissions_form_created
  ON guided_form_submissions(form_id, created_at);

CREATE INDEX IF NOT EXISTS idx_guided_form_submissions_site_email
  ON guided_form_submissions(site_id, contact_email);
