-- One follow-up for somebody who registered but did not finish verification.
--
-- Null means the daily housekeeping pass may still claim the account once it
-- is three days old. The timestamp is written before delivery, so two servers
-- running the same pass cannot send duplicate reminders.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "verification_reminder_sent_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "ix_users_verification_reminder_due"
  ON "users" ("created_at")
  WHERE "status" = 'active'
    AND "password_hash" IS NOT NULL
    AND "email_verified_at" IS NULL
    AND "verification_reminder_sent_at" IS NULL;
