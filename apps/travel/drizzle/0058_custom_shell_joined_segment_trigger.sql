ALTER TABLE "automations"
  ADD COLUMN IF NOT EXISTS "paused_reason" text;

ALTER TABLE "automation_runs"
  ADD COLUMN IF NOT EXISTS "subject_contact_id" varchar(36)
    REFERENCES "contacts" ("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "ix_automation_runs_subject_contact"
  ON "automation_runs" ("subject_contact_id");

-- One row says the first safe look has happened, including when the segment was
-- empty. Without it an empty first look is indistinguishable from no look.
CREATE TABLE IF NOT EXISTS "automation_segment_watches" (
  "automation_id" varchar(36) PRIMARY KEY
    REFERENCES "automations" ("id") ON DELETE CASCADE,
  "segment_id" varchar(36) NOT NULL
    REFERENCES "contact_segments" ("id") ON DELETE CASCADE,
  "last_scanned_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_automation_segment_watches_segment"
  ON "automation_segment_watches" ("segment_id");

-- Who was in the watched segment at the last look. Only live watched flows
-- receive rows, and leaving removes the row on the next look.
CREATE TABLE IF NOT EXISTS "automation_segment_snapshot" (
  "automation_id" varchar(36) NOT NULL
    REFERENCES "automations" ("id") ON DELETE CASCADE,
  "segment_id" varchar(36) NOT NULL
    REFERENCES "contact_segments" ("id") ON DELETE CASCADE,
  "contact_id" varchar(36) NOT NULL
    REFERENCES "contacts" ("id") ON DELETE CASCADE,
  "last_seen_at" timestamptz NOT NULL,
  CONSTRAINT "automation_segment_snapshot_pk"
    PRIMARY KEY ("automation_id", "contact_id")
);

CREATE INDEX IF NOT EXISTS "ix_automation_segment_snapshot_segment"
  ON "automation_segment_snapshot" ("segment_id");

-- Permanent once-per-person memory. It is deliberately separate from run
-- history, because deleting an old run must not make a real email fire again.
CREATE TABLE IF NOT EXISTS "automation_segment_enrollments" (
  "automation_id" varchar(36) NOT NULL
    REFERENCES "automations" ("id") ON DELETE CASCADE,
  "contact_id" varchar(36) NOT NULL
    REFERENCES "contacts" ("id") ON DELETE CASCADE,
  "started_at" timestamptz NOT NULL,
  CONSTRAINT "automation_segment_enrollments_pk"
    PRIMARY KEY ("automation_id", "contact_id")
);
