-- One status name per user. This lets listUserStatuses seed defaults with
-- ON CONFLICT DO NOTHING (safe if two first-loads race) and rejects duplicate
-- status names. Added idempotently so the migration can re-run.
DO $$ BEGIN
  ALTER TABLE "profile_statuses"
    ADD CONSTRAINT "uq_profile_statuses_user_name" UNIQUE ("user_id", "name");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
