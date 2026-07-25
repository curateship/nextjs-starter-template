-- Community event submissions: a public "submit your event" form feeding an
-- admin review queue. Approving a submission creates a DRAFT event (nothing goes
-- live until the owner publishes). Mirrors the directory_claims review-queue
-- model. Date/time is captured as free text for now; a later structured-date
-- pass (see the Event RSVPs task) can map it into the event-content block.

DO $$ BEGIN
  CREATE TYPE event_submission_status_enum AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS event_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  status event_submission_status_enum NOT NULL DEFAULT 'pending',
  event_name VARCHAR(255) NOT NULL,
  description TEXT,
  -- Free-text "when" (e.g. "Saturday, Aug 16 · 7pm"). Kept as text on purpose:
  -- submitters won't reliably use a date picker, and the owner sets the real
  -- structured date/time when polishing the approved draft.
  date_time_text VARCHAR(255),
  location VARCHAR(255),
  submitter_email VARCHAR(255) NOT NULL,
  -- Set when approved: the draft event this submission created. SET NULL if that
  -- draft is later deleted, so the submission stays as an audit record.
  created_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Queue reads are always "this site's submissions with this status, newest first".
CREATE INDEX IF NOT EXISTS idx_event_submissions_site_status_created
  ON event_submissions (site_id, status, created_at DESC, id);

-- Surface a new pending submission in the Hub notification bell (same queue
-- mechanism as directory claims / owner edits), so allow the new type.
ALTER TABLE hub_notifications DROP CONSTRAINT IF EXISTS hub_notifications_type_check;
ALTER TABLE hub_notifications ADD CONSTRAINT hub_notifications_type_check
  CHECK (type IN (
    'product_order',
    'directory_claim',
    'directory_owner_edit',
    'directory_featured',
    'newsletter_paused',
    'directory_featured_expired',
    'event_submission'
  ));
