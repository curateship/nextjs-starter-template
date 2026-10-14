-- The CRM: email that comes in becomes a lead you can chase.
--
-- The app could send email and could not receive any. Nothing recorded a
-- conversation, so a reply to a newsletter went to an address nobody read, and
-- there was nowhere to write down that somebody asked for a quote on Tuesday.
--
-- Six tables, and the shape of them is one decision worth stating out loud:
-- **a lead is an email address, not a contact.** `contacts` is the newsletter
-- audience. Somebody emailing you has not asked for a newsletter, so an
-- inbound address never writes a contact row on its own — it writes a lead
-- here, and links to a contact only when one already exists on that address or
-- somebody presses "Add to contacts". Upserting a contact instead would have
-- quietly added every stranger to the send list.

-- One row per address that has ever written in, with everything about them that
-- is not an email: what stage they are at, what the work is worth, and when to
-- chase them.
CREATE TABLE IF NOT EXISTS "crm_leads" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "name" varchar(255),
  "company" varchar(255),
  "phone" varchar(60),
  -- Where they came from, in words: "Email", or whatever an import called it.
  "source" varchar(255),
  "stage" varchar(20) NOT NULL DEFAULT 'new',
  -- Cents, because money in a float is money that stops adding up. Shown in
  -- dollars everywhere a person reads it.
  "value_cents" integer NOT NULL DEFAULT 0,
  "follow_up_at" timestamp with time zone,
  "follow_up_note" text,
  -- Stamped when the background pass has said "chase this one" once, so it
  -- cannot say it again on the next pass fifteen seconds later.
  "follow_up_notified_at" timestamp with time zone,
  -- The newsletter contact this lead turned out to be, when it is one. SET NULL
  -- rather than CASCADE: deleting somebody from the newsletter must not delete
  -- the record of the job they paid for.
  "contact_id" varchar(36) REFERENCES "contacts"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "crm_leads_stage_check" CHECK ("stage" IN ('new', 'contacted', 'quoted', 'won', 'lost'))
);

-- One lead per address per workspace. Lowered, because mail arrives with
-- whatever capitals the sender's client felt like using.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_crm_leads_workspace_email"
  ON "crm_leads" ("workspace_id", lower("email"));

-- The follow-up job's own question: whose chase date has passed and has not
-- been mentioned yet. Partial, because it is a handful of rows out of a table
-- that only grows.
CREATE INDEX IF NOT EXISTS "ix_crm_leads_follow_up_due"
  ON "crm_leads" ("workspace_id", "follow_up_at")
  WHERE "follow_up_at" IS NOT NULL AND "follow_up_notified_at" IS NULL;

CREATE INDEX IF NOT EXISTS "ix_crm_leads_workspace_stage"
  ON "crm_leads" ("workspace_id", "stage");

-- One back-and-forth. The left panel of the CRM is one row per thread, which
-- is why the newest message's time and the message count are kept here rather
-- than counted over the messages on every list.
CREATE TABLE IF NOT EXISTS "crm_threads" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "lead_id" varchar(36) NOT NULL REFERENCES "crm_leads"("id") ON DELETE CASCADE,
  "subject" text NOT NULL DEFAULT '',
  -- The subject with every "Re:" and "Fwd:" taken off, squeezed and lowered,
  -- by `normalizeSubject` in src/lib/crm/thread-match.ts. Stored rather than
  -- worked out on the way in, because matching a reply to its thread is a
  -- lookup on this and SQL cannot strip a stack of reply prefixes.
  "subject_key" varchar(500) NOT NULL DEFAULT '',
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "snoozed_until" timestamp with time zone,
  "last_message_at" timestamp with time zone NOT NULL,
  "last_direction" varchar(3) NOT NULL,
  "message_count" integer NOT NULL DEFAULT 0,
  -- Null is unread. Stamped when somebody opens the thread, cleared when a new
  -- message lands in it.
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "crm_threads_status_check" CHECK ("status" IN ('open', 'snoozed', 'closed')),
  CONSTRAINT "crm_threads_last_direction_check" CHECK ("last_direction" IN ('in', 'out'))
);

-- The inbox list, exactly: this workspace's threads, newest message first.
CREATE INDEX IF NOT EXISTS "ix_crm_threads_workspace_last_message"
  ON "crm_threads" ("workspace_id", "last_message_at" DESC);

CREATE INDEX IF NOT EXISTS "ix_crm_threads_workspace_status"
  ON "crm_threads" ("workspace_id", "status");

CREATE INDEX IF NOT EXISTS "ix_crm_threads_lead"
  ON "crm_threads" ("lead_id");

-- Rule two of thread matching: has this person written about this same subject
-- recently. Read once per piece of inbound mail.
CREATE INDEX IF NOT EXISTS "ix_crm_threads_lead_subject"
  ON "crm_threads" ("lead_id", "subject_key", "last_message_at" DESC);

-- One email, in or out.
--
-- The body arrives in a second request. Resend's email.received webhook carries
-- the sender, the subject and the attachment names and nothing else, so a
-- message is written the moment the hook fires and filled in once the receiving
-- endpoint has answered. `body_fetched_at` null means that second call has not
-- landed yet, and the background pass retries those.
CREATE TABLE IF NOT EXISTS "crm_messages" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "thread_id" varchar(36) NOT NULL REFERENCES "crm_threads"("id") ON DELETE CASCADE,
  "direction" varchar(3) NOT NULL,
  "from_email" varchar(255) NOT NULL,
  "from_name" varchar(255),
  "to_email" varchar(255) NOT NULL,
  "subject" text NOT NULL DEFAULT '',
  "text_body" text,
  "html_body" text,
  -- The Message-ID header. Replies quote it in In-Reply-To, which is how a
  -- thread stays one thread.
  "rfc_message_id" varchar(998),
  "in_reply_to" varchar(998),
  -- Resend's own id: the received email's id on the way in, the sent message's
  -- id on the way out.
  "provider_email_id" varchar(255),
  -- Names, sizes and types only. The files stay with Resend; fetching them into
  -- storage is a separate job nobody has asked for yet.
  "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "body_fetched_at" timestamp with time zone,
  -- How many times the body fetch has been tried, so a message whose content
  -- Resend will never answer for stops being asked about.
  "body_attempts" integer NOT NULL DEFAULT 0,
  -- When the email was sent or received, which is what the conversation is
  -- ordered by. Not the same as when this row was written.
  "occurred_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "crm_messages_direction_check" CHECK ("direction" IN ('in', 'out'))
);

-- The replay guard. A webhook that arrives twice — and Resend retries whenever
-- it is not answered quickly — must not write the same email twice.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_crm_messages_provider_email"
  ON "crm_messages" ("workspace_id", "provider_email_id")
  WHERE "provider_email_id" IS NOT NULL;

-- Threading reads this: does any message already have the Message-ID this new
-- one is replying to.
CREATE INDEX IF NOT EXISTS "ix_crm_messages_rfc_message_id"
  ON "crm_messages" ("workspace_id", "rfc_message_id")
  WHERE "rfc_message_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ix_crm_messages_thread_occurred"
  ON "crm_messages" ("thread_id", "occurred_at");

-- The retry job's question: which bodies are still missing.
CREATE INDEX IF NOT EXISTS "ix_crm_messages_body_pending"
  ON "crm_messages" ("created_at")
  WHERE "body_fetched_at" IS NULL;

-- Where this workspace's mail comes in. Resend delivers to one address per
-- inbound domain, and the webhook says which address a message was "received
-- for", which is how one deployment serving several sites knows whose mail it
-- is holding. Replies go out from this address too, so the answer comes back to
-- the same place rather than to a send-only sender nobody reads.
ALTER TABLE "email_settings" ADD COLUMN IF NOT EXISTS "inbound_address" varchar(255);

-- A chase date that has passed puts a notice in the bell, and a notice needs a
-- type the check constraint allows.
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" IN ('feedback_vote', 'feedback_comment', 'feedback_merged', 'changelog', 'announcement', 'ai_limit_warning', 'ai_limit_reached', 'automation_approval', 'automation_failed', 'account_update', 'system_email_failed', 'app_activity', 'crm_follow_up'));

-- Which thread a crm_follow_up notice is about, so clicking it opens that
-- conversation. SET NULL: a deleted thread leaves the notice standing with
-- nowhere to go, which is better than deleting what somebody was told.
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "crm_thread_id" varchar(36)
  REFERENCES "crm_threads"("id") ON DELETE SET NULL;
