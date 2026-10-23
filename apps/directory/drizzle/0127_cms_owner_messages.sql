-- "Message the owner" on a listing that somebody looks after.
--
-- A visitor writes a message on the listing's page, and the site emails it to
-- the owner with the visitor's address to reply to. The site keeps one row per
-- message: which listing, when, and whether the email went.
--
-- The visitor's name, address and words are kept for 30 days, long enough to
-- answer a complaint about a message, and then emptied. `text_cleared_at` says
-- when that happened; the row itself stays as the record that a message was
-- passed on. Tyler chose 30 days on 16 Oct 2026.
--
-- Off on every site until an admin switches it on.

ALTER TABLE "directory_settings"
  ADD COLUMN IF NOT EXISTS "owner_messages_enabled" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "directory_owner_messages" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL
    REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "listing_id" varchar(36) NOT NULL
    REFERENCES "directory_listings"("id") ON DELETE CASCADE,
  "sender_name" varchar(120) NOT NULL DEFAULT '',
  "sender_email" varchar(255) NOT NULL DEFAULT '',
  "message" varchar(2000) NOT NULL DEFAULT '',
  "status" varchar(10) NOT NULL,
  "error" varchar(500) NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL,
  "text_cleared_at" timestamptz,
  CONSTRAINT "directory_owner_messages_status_check"
    CHECK ("status" IN ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS "ix_directory_owner_messages_workspace_created"
  ON "directory_owner_messages" ("workspace_id", "created_at");

CREATE INDEX IF NOT EXISTS "ix_directory_owner_messages_listing"
  ON "directory_owner_messages" ("listing_id");

-- The 30-day sweep only ever looks at rows that still hold words.
CREATE INDEX IF NOT EXISTS "ix_directory_owner_messages_text_kept"
  ON "directory_owner_messages" ("created_at")
  WHERE "text_cleared_at" IS NULL;
