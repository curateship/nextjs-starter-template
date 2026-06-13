-- Event template inheritance (mirrors category migration 170 / directory 126 + 167):
-- templates own block structure, event rows store only block values.
-- Difference from category: the Blank template seeds one event-content block so
-- value-only events always have a content block to edit (events have one block type).

-- 1. Create the event_templates table
CREATE TABLE IF NOT EXISTS event_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content_blocks JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_templates_site ON event_templates (site_id);

DROP TRIGGER IF EXISTS update_event_templates_updated_at ON event_templates;
CREATE TRIGGER update_event_templates_updated_at
  BEFORE UPDATE ON event_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Seed a Blank template per site (default when the site has no default yet).
--    Seeded with one event-content block so value-only events have something to edit.
INSERT INTO event_templates (site_id, name, content_blocks, is_default, created_at, updated_at)
SELECT
  s.id,
  'Blank',
  '{"event-content-default":{"id":"event-content-default","type":"event-content","display_order":0,"content":{"eventContentStyle":"default"}}}'::jsonb,
  NOT EXISTS (
    SELECT 1
    FROM event_templates existing_default
    WHERE existing_default.site_id = s.id
      AND existing_default.is_default = true
  ),
  now(),
  now()
FROM sites s
WHERE NOT EXISTS (
  SELECT 1
  FROM event_templates existing_blank
  WHERE existing_blank.site_id = s.id
    AND existing_blank.name = 'Blank'
);

-- 3. Add template_id to events and backfill before enforcing NOT NULL
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS template_id UUID;

UPDATE events e
SET template_id = (
  SELECT et.id
  FROM event_templates et
  WHERE et.site_id = e.site_id
  ORDER BY et.is_default DESC, (et.name = 'Blank') DESC, et.updated_at DESC
  LIMIT 1
)
WHERE e.template_id IS NULL;

ALTER TABLE events
  ALTER COLUMN template_id SET NOT NULL;

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_template_id_event_templates_id_fk;

ALTER TABLE events
  ADD CONSTRAINT events_template_id_event_templates_id_fk
  FOREIGN KEY (template_id)
  REFERENCES event_templates(id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_events_template
  ON events (template_id);
