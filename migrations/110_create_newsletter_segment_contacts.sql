CREATE TABLE newsletter_segment_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES newsletter_segments(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES newsletter_contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX idx_segment_contacts_unique ON newsletter_segment_contacts(segment_id, contact_id);
CREATE INDEX idx_segment_contacts_contact ON newsletter_segment_contacts(contact_id);

ALTER TABLE newsletter_segments DROP COLUMN IF EXISTS filter_rules;
