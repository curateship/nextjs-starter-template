-- Saved contact segments: a group of people named once, so everything that
-- needs to say "who this is for" can point at the name instead of describing
-- the group again every time.
--
-- Nothing existing changes. Both tables start empty, and no other table gains a
-- column, so this migration cannot alter who any newsletter already goes to.

-- The segment itself.
--
-- `kind` is the whole design in one column:
--
--   'rules'  — the conditions are saved and the people never are. Worked out
--              fresh every time anything asks, so somebody who unsubscribes
--              this morning is out of it this afternoon and nobody had to
--              remember. `rules` holds them; `contact_segment_members` is empty.
--   'static' — the people were hand-picked, and those rows live in
--              `contact_segment_members`. `rules` is empty.
--
-- This is the opposite call to keeping a synced copy of who is in a rules
-- segment: a copy needs change hooks, cascading re-syncs and a loop guard, and
-- it can be wrong. Working it out fresh cannot be.
CREATE TABLE IF NOT EXISTS "contact_segments" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "kind" varchar(20) NOT NULL DEFAULT 'rules',
  "rules" jsonb NOT NULL DEFAULT '{"conditions":[]}'::jsonb,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "contact_segments_kind_check"
    CHECK ("kind" in ('rules', 'static'))
);

-- Two segments in one workspace cannot share a name, however it was typed.
-- "Paying members" and "paying members" are the same group to a reader, and a
-- list with both on it is one nobody can point at with confidence.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_contact_segments_workspace_name"
  ON "contact_segments" ("workspace_id", lower("name"));

CREATE INDEX IF NOT EXISTS "ix_contact_segments_workspace"
  ON "contact_segments" ("workspace_id");

-- Who is in a hand-picked segment. Empty for a rules segment, always.
--
-- Both sides cascade: deleting the segment takes its membership with it, and a
-- contact who is deleted stops being in every segment at once rather than
-- leaving rows pointing at nobody.
CREATE TABLE IF NOT EXISTS "contact_segment_members" (
  "segment_id" varchar(36) NOT NULL
    REFERENCES "contact_segments" ("id") ON DELETE CASCADE,
  "contact_id" varchar(36) NOT NULL
    REFERENCES "contacts" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "contact_segment_members_pk" PRIMARY KEY ("segment_id", "contact_id")
);

-- "Which segments is this person in" — asked by the contact's own window, and
-- the direction the primary key above cannot answer.
CREATE INDEX IF NOT EXISTS "ix_contact_segment_members_contact"
  ON "contact_segment_members" ("contact_id");
