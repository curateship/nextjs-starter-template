ALTER TABLE IF EXISTS "sessions" RENAME TO "user_sessions";

ALTER INDEX IF EXISTS "ix_sessions_user_id" RENAME TO "ix_user_sessions_user_id";
ALTER INDEX IF EXISTS "ix_sessions_token_hash" RENAME TO "ix_user_sessions_token_hash";
ALTER INDEX IF EXISTS "ix_sessions_expires_at" RENAME TO "ix_user_sessions_expires_at";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_token_hash_unique'
  ) THEN
    ALTER TABLE "user_sessions"
      RENAME CONSTRAINT "sessions_token_hash_unique" TO "user_sessions_token_hash_unique";
  END IF;
END $$;
