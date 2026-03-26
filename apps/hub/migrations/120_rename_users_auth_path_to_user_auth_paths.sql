BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'users_auth_path'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_auth_paths'
  ) THEN
    ALTER TABLE users_auth_path RENAME TO user_auth_paths;
  END IF;
END $$;

COMMIT;
