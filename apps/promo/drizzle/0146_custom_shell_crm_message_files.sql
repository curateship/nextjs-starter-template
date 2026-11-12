-- Open the files they send (CRM task 21, built in task 36, 7 Nov 2026). The
-- background pass fetches an inbound message's files from Resend into the
-- site's storage, as it fetches the words, and gives up after five tries.
-- These two columns are that pass's bookkeeping. Existing messages start
-- unfetched, so their files are fetched too while Resend still holds them.
ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "files_fetched_at" timestamp with time zone;
ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "file_attempts" integer DEFAULT 0 NOT NULL;

-- Our own replies carry files from the media library, already stored.
UPDATE "crm_messages" SET "files_fetched_at" = "created_at"
WHERE "direction" = 'out' AND "files_fetched_at" IS NULL;

-- The fetch's own question: inbound mail with files, not yet fetched.
CREATE INDEX IF NOT EXISTS "ix_crm_messages_files_pending"
  ON "crm_messages" ("created_at")
  WHERE "files_fetched_at" IS NULL AND "direction" = 'in';
