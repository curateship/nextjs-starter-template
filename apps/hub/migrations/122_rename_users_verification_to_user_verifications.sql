BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'users_verification'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_verifications'
  ) THEN
    ALTER TABLE users_verification RENAME TO user_verifications;
  END IF;
END $$;

COMMIT;
