-- Mail from an address you have blocked stops filling the pipeline, and is
-- kept rather than thrown away.
--
-- Every sender became a lead at stage New, so a spam run from six addresses
-- was six leads sitting in the pipeline and six rows in an inbox that is meant
-- to be the list of things that need doing.
--
-- One table, and the shape of it is one decision worth stating out loud:
-- **nothing is ever deleted.** A customer blocked by accident is the risk this
-- whole feature is shaped around, so blocked mail is still written, the note
-- records why the block was made, and unblocking is one press.
--
-- The task file asked for this as migration 0083. That number was taken by the
-- CRM reply name before this was built, so it is 0091.
CREATE TABLE IF NOT EXISTS "crm_blocked_senders" (
  "id" varchar(36) PRIMARY KEY,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  -- A whole address (`spam@example.com`), or a whole domain written with a
  -- leading at sign (`@example.com`). Stored lowered, because mail arrives
  -- with whatever capitals the sender's client felt like using.
  "pattern" varchar(255) NOT NULL,
  -- Why it was blocked, in whatever words the person typed. Optional, and the
  -- date beside it is `created_at`.
  "note" varchar(500),
  "created_at" timestamp with time zone NOT NULL
);

-- One row per pattern per workspace, so pressing Block twice on the same
-- sender is not two rows saying the same thing. Lowered for the same reason
-- the column is stored lowered, and this is also the index the inbound path's
-- lookup reads: `workspace_id = $1 AND lower(pattern) IN ($address, $domain)`.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_crm_blocked_senders_workspace_pattern"
  ON "crm_blocked_senders" ("workspace_id", lower("pattern"));
