-- The app's own emails become editable, and start keeping a record.
--
-- Before this, every word of the six emails the app sends for itself — verify
-- your address, your sign-in link, reset your password, confirm your new
-- address, and the one an admin triggers by creating an account — was typed
-- into the code. Changing "Verify your email" needed a developer and a deploy.
-- And nothing anywhere recorded that any of them had been sent, so "the link
-- never arrived" was unanswerable.
--
-- Neither table is workspace-scoped, which is the one thing here that differs
-- from the newsletter. A workspace belongs to one person; somebody clicking a
-- verification link has no workspace and barely has an account. There is one
-- set of these emails and it belongs to the app.

CREATE TABLE IF NOT EXISTS "system_emails" (
  -- One of the kinds in src/lib/system-emails/kinds.ts. No row means "use the
  -- built-in wording", which is the normal state until somebody edits one.
  "kind" varchar(60) PRIMARY KEY,
  "subject" text NOT NULL DEFAULT '',
  "preheader" text NOT NULL DEFAULT '',
  "from_name" varchar(255),
  "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Kept in step with the blocks on every save, exactly as a broadcast's is.
  "rendered_html" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

-- Note above: kept apart from "deliveries" on purpose. That table requires a
-- contact and holds the newsletter's exactly-once index; these go to people who
-- are not contacts, and the same person may ask for ten reset links in a row.
CREATE TABLE IF NOT EXISTS "system_email_sends" (
  "id" varchar(36) PRIMARY KEY,
  "kind" varchar(60) NOT NULL,
  "to_email" varchar(255) NOT NULL,
  "subject" text NOT NULL,
  -- Resend's id for the message, so a bounce can be traced back to it.
  "provider_message_id" varchar(255),
  "status" varchar(20) NOT NULL,
  "error" text,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "system_email_sends_status_check" CHECK ("status" IN ('sent', 'failed'))
);

-- The bottom panel of the editor reads the newest sends of one kind, which is
-- exactly this index.
CREATE INDEX IF NOT EXISTS "ix_system_email_sends_kind_created"
  ON "system_email_sends" ("kind", "created_at");
