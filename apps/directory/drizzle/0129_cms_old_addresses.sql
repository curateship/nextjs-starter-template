-- Old addresses keep working.
--
-- When a listing, event, post or deal changes its address, the old address is
-- kept here with the address the record has now. The public page for an
-- address nobody has any more looks here and forwards, with a permanent
-- redirect, instead of answering "not found".
--
-- `current_slug` is always the record's address today, never the one it moved
-- to next, so every old address is one hop from the page. Renaming a record
-- moves every row that pointed at it along with it.
--
-- One old address per site and kind: two sites can each have once had a
-- `joes-diner`, and a listing and a deal can both have once been `joes-diner`.

CREATE TABLE IF NOT EXISTS "old_addresses" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "old_slug" varchar(160) NOT NULL,
  "current_slug" varchar(160) NOT NULL,
  "changed_at" timestamptz NOT NULL,
  CONSTRAINT "old_addresses_kind_check"
    CHECK ("kind" IN ('listing', 'event', 'post', 'promotion')),
  -- An address forwarding to itself would send a visitor round in a circle.
  CONSTRAINT "old_addresses_not_itself_check"
    CHECK ("old_slug" <> "current_slug")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ux_old_addresses_site_kind_old"
  ON "old_addresses" ("workspace_id", "kind", "old_slug");

-- A rename moves every row pointing at the record's previous address, and a
-- delete forgets them, so both look rows up by where they point.
CREATE INDEX IF NOT EXISTS "ix_old_addresses_site_kind_current"
  ON "old_addresses" ("workspace_id", "kind", "current_slug");
