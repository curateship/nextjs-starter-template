-- The newsletter: a list of people, an email built out of blocks, and a record
-- of every message that actually went out.
--
-- Sending real email to real people is the riskiest thing this app does, so
-- three things in here matter more than any feature:
--
--   1. `ux_deliveries_broadcast_contact` is the exactly-once guard. A row is
--      written the moment a send is attempted, and the database itself refuses
--      a second row for the same person on the same broadcast. An interrupted
--      send that gets picked up again therefore cannot mail anybody twice, no
--      matter how it is resumed.
--   2. A broadcast owns a *claim*, not a lock — the same pattern the automation
--      runs use. A ticker stamps `claim_token` on a batch of due broadcasts and
--      only writes back to rows still carrying its token, so two servers can
--      tick at once and neither steals the other's batch. A server that dies
--      leaves a claim that goes stale after five minutes and is simply taken
--      again.
--   3. `rendered_html` is frozen when the send starts. Editing the blocks
--      afterwards cannot change what a send already in flight is putting in
--      people's inboxes.

CREATE TABLE IF NOT EXISTS "contacts" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "first_name" varchar(255),
  "last_name" varchar(255),
  -- Where they came from: the sign-up page, an import, added by hand.
  "source" varchar(255),
  -- The segments they belong to. A broadcast can go to everyone or to tags.
  "tags" text[] NOT NULL DEFAULT '{}'::text[],
  "status" varchar(20) NOT NULL DEFAULT 'subscribed',
  "unsubscribed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "contacts_status_check" CHECK (
    "status" IN ('subscribed', 'unsubscribed')
  )
);

-- Case-insensitive, because Ada@x.dev and ada@x.dev are one person, and two
-- rows for one person is how a list starts sending the same thing twice.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_contacts_workspace_email"
  ON "contacts" ("workspace_id", lower("email"));

CREATE INDEX IF NOT EXISTS "ix_contacts_workspace_created"
  ON "contacts" ("workspace_id", "created_at");

CREATE TABLE IF NOT EXISTS "broadcasts" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "subject" text NOT NULL DEFAULT '',
  -- The grey line the inbox shows after the subject.
  "preheader" text NOT NULL DEFAULT '',
  "from_name" varchar(255),
  "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Frozen at send time. See note 3 above.
  "rendered_html" text,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "audience_filter" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "scheduled_at" timestamp with time zone,
  -- When the next batch may go. Null means "as soon as the ticker gets to it".
  "next_batch_at" timestamp with time zone,
  "batches_sent" integer NOT NULL DEFAULT 0,
  -- Why it stopped, in words, whether a person paused it or the failure guard
  -- did. Shown as-is in the editor's status panel.
  "paused_reason" text,
  "total_recipients" integer NOT NULL DEFAULT 0,
  "total_sent" integer NOT NULL DEFAULT 0,
  "total_failed" integer NOT NULL DEFAULT 0,
  "sent_at" timestamp with time zone,
  "claim_token" varchar(36),
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "broadcasts_status_check" CHECK (
    "status" IN ('draft', 'scheduled', 'sending', 'paused', 'sent')
  )
);

CREATE INDEX IF NOT EXISTS "ix_broadcasts_workspace_status"
  ON "broadcasts" ("workspace_id", "status");

-- The claim query, exactly: broadcasts that are sending and are due.
CREATE INDEX IF NOT EXISTS "ix_broadcasts_status_next_batch"
  ON "broadcasts" ("status", "next_batch_at");

CREATE TABLE IF NOT EXISTS "broadcast_templates" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_broadcast_templates_workspace"
  ON "broadcast_templates" ("workspace_id");

-- Only one template can be the one new broadcasts start from.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_broadcast_templates_default"
  ON "broadcast_templates" ("workspace_id")
  WHERE "is_default";

CREATE TABLE IF NOT EXISTS "deliveries" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  -- SET NULL, not CASCADE: deleting a broadcast must not erase the record of
  -- what was already sent to real people.
  "broadcast_id" varchar(36) REFERENCES "broadcasts"("id") ON DELETE SET NULL,
  "contact_id" varchar(36) NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "to_email" varchar(255) NOT NULL,
  "subject" text NOT NULL,
  -- Resend's id for the message, so a bounce can be traced back to it.
  "provider_message_id" varchar(255),
  "status" varchar(20) NOT NULL,
  "error" text,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "deliveries_status_check" CHECK ("status" IN ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS "ix_deliveries_workspace_created"
  ON "deliveries" ("workspace_id", "created_at");

CREATE INDEX IF NOT EXISTS "ix_deliveries_contact"
  ON "deliveries" ("contact_id");

CREATE INDEX IF NOT EXISTS "ix_deliveries_broadcast"
  ON "deliveries" ("broadcast_id");

-- Note 1 above: the exactly-once guard. Partial, because rows kept after their
-- broadcast was deleted all have a null broadcast_id and must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_deliveries_broadcast_contact"
  ON "deliveries" ("broadcast_id", "contact_id")
  WHERE "broadcast_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "email_settings" (
  "workspace_id" varchar(36) PRIMARY KEY REFERENCES "workspaces"("id") ON DELETE CASCADE,
  -- Encrypted with encryptSecret, never read back to the browser.
  "resend_api_key_encrypted" text,
  "from_email" varchar(255),
  "from_name" varchar(255),
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
