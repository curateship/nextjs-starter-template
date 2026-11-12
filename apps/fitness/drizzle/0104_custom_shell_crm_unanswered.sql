-- Chase unanswered mail (CRM task 11, built in task 36, 7 Nov 2026). When
-- somebody wrote last and nobody has answered for the site's number of days,
-- the bell says so, once per conversation. A new message from them clears
-- the stamp, so a conversation ignored twice is chased twice.
--
-- The number of days lives beside the CRM's other reply settings. 3 unless
-- somebody changes it; 0 turns the chase off. Not null with a default, so a
-- site that predates the setting chases after 3 days like a new one.
ALTER TABLE "crm_threads" ADD COLUMN IF NOT EXISTS "unanswered_notified_at" timestamp with time zone;
ALTER TABLE "email_settings" ADD COLUMN IF NOT EXISTS "crm_unanswered_days" integer DEFAULT 3 NOT NULL;

DO $$ BEGIN
  ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_crm_unanswered_days_check"
    CHECK ("crm_unanswered_days" BETWEEN 0 AND 60);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The chase job's own question: open conversations they wrote last, not yet chased.
CREATE INDEX IF NOT EXISTS "ix_crm_threads_unanswered"
  ON "crm_threads" ("last_message_at")
  WHERE "status" = 'open' AND "last_direction" = 'in' AND "unanswered_notified_at" IS NULL;
