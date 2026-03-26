BEGIN;

-- Make the legacy app table explicit so Better Auth can take over the canonical `users` name.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'users'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'users_legacy'
  ) THEN
    ALTER TABLE users RENAME TO users_legacy;
  END IF;
END $$;

-- Move legacy app users into the Better Auth table before renaming it.
INSERT INTO "user" (
  "id",
  "name",
  "email",
  "emailVerified",
  "image",
  "createdAt",
  "updatedAt",
  "role",
  "banned",
  "banReason",
  "banExpires",
  "displayName"
)
SELECT
  u.id::text,
  COALESCE(NULLIF(u.display_name, ''), split_part(u.email, '@', 1)),
  u.email,
  u.email_verified_at IS NOT NULL,
  NULL,
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now()),
  COALESCE(u.role, 'end_user'),
  false,
  NULL,
  NULL,
  NULLIF(u.display_name, '')
FROM users_legacy u
WHERE NOT EXISTS (
  SELECT 1
  FROM "user" ba
  WHERE ba.id = u.id::text
     OR ba.email = u.email
);

-- Backfill role/profile fields onto matching Better Auth users.
UPDATE "user" ba
SET
  "role" = COALESCE(ba."role", u.role, 'end_user'),
  "displayName" = COALESCE(ba."displayName", NULLIF(u.display_name, '')),
  "name" = COALESCE(NULLIF(ba."name", ''), NULLIF(u.display_name, ''), split_part(u.email, '@', 1)),
  "emailVerified" = COALESCE(ba."emailVerified", false) OR u.email_verified_at IS NOT NULL
FROM users_legacy u
WHERE ba.id = u.id::text
   OR ba.email = u.email;

-- Preserve existing password hashes for migrated credential accounts.
DO $$
DECLARE auth_account_table text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_auth_paths'
  ) THEN
    auth_account_table := 'user_auth_paths';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'users_auth_path'
  ) THEN
    auth_account_table := 'users_auth_path';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'account'
  ) THEN
    auth_account_table := 'account';
  ELSE
    RAISE EXCEPTION 'Expected Better Auth account table to exist before migration';
  END IF;

  EXECUTE format($migration$
    INSERT INTO %1$I (
      "id",
      "accountId",
      "providerId",
      "userId",
      "password",
      "createdAt",
      "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      ba.id,
      'credential',
      ba.id,
      u.password_hash,
      COALESCE(u.created_at, now()),
      COALESCE(u.updated_at, now())
    FROM users_legacy u
    JOIN "user" ba
      ON ba.id = u.id::text
      OR ba.email = u.email
    WHERE u.password_hash IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM %1$I a
        WHERE a."providerId" = 'credential'
          AND a."userId" = ba.id
      );
  $migration$, auth_account_table);
END $$;

DO $$
DECLARE constraint_name text;
BEGIN
  SELECT tc.constraint_name
  INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema = tc.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'sites'
    AND kcu.column_name = 'user_id'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'users_legacy'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sites DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

DO $$
DECLARE constraint_name text;
BEGIN
  SELECT tc.constraint_name
  INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema = tc.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'media'
    AND kcu.column_name = 'user_id'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'users_legacy'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE media DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE sites
  ALTER COLUMN user_id TYPE text
  USING user_id::text;

ALTER TABLE media
  ALTER COLUMN user_id TYPE text
  USING user_id::text;

-- If an auth user already existed with the same email but a different id, remap ownership.
UPDATE sites s
SET user_id = ba.id
FROM users_legacy u
JOIN "user" ba
  ON ba.email = u.email
WHERE s.user_id = u.id::text
  AND ba.id <> s.user_id;

UPDATE media m
SET user_id = ba.id
FROM users_legacy u
JOIN "user" ba
  ON ba.email = u.email
WHERE m.user_id = u.id::text
  AND ba.id <> m.user_id;

-- Promote the Better Auth table to the canonical plural name.
ALTER TABLE "user" RENAME TO users;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sites_user_id_users_id_fk'
  ) THEN
    ALTER TABLE sites
      ADD CONSTRAINT sites_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'media_user_id_users_id_fk'
  ) THEN
    ALTER TABLE media
      ADD CONSTRAINT media_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
