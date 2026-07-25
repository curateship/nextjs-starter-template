-- Recurring events: repeat rules + a series link between generated occurrences.
-- Builds on the existing block-JSON date model (event date/time live in the
-- event-content block); the columns here are scheduling bookkeeping only.

-- Repeat rule, stored ONLY on the series anchor (the event the owner edits).
-- Shape: {"freq":"weekly","weekdays":[2],"until":"2026-12-31"}
--     or {"freq":"monthly","week":1,"weekday":5,"until":null}
-- (weekday: 0=Sun..6=Sat; week: 1..4 or -1 for last)
-- NULL = not a repeating event (or a series whose repeat was stopped).
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_rule JSONB;

-- Link from a generated occurrence back to its anchor event. NULL on the anchor
-- itself and on standalone events. ON DELETE SET NULL so deleting the anchor
-- never cascade-deletes published occurrence pages — they just become standalone.
ALTER TABLE events ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES events(id) ON DELETE SET NULL;

-- Marks an occurrence the owner edited on its own. Series edits skip it and a
-- rule change never deletes or regenerates it.
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_detached BOOLEAN NOT NULL DEFAULT false;

-- The wall-clock date this occurrence was scheduled for (YYYY-MM-DD). Immutable
-- scheduling key; NULL on anchors/standalone rows.
ALTER TABLE events ADD COLUMN IF NOT EXISTS series_occurrence_date DATE;

CREATE INDEX IF NOT EXISTS idx_events_series ON events(series_id);

-- One occurrence per (series, date): makes generation idempotent at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS unique_events_series_occurrence
  ON events(series_id, series_occurrence_date)
  WHERE series_id IS NOT NULL AND series_occurrence_date IS NOT NULL;

-- Register the occurrence-generation cron with the unified runner (every 15 min).
INSERT INTO cron_jobs (name, endpoint, schedule, enabled)
SELECT 'Event occurrences', '/api/cron/event-occurrences', '*/15 * * * *', true
WHERE NOT EXISTS (SELECT 1 FROM cron_jobs WHERE endpoint = '/api/cron/event-occurrences');
