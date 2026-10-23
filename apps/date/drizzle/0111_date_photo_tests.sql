-- First-photo test (part 3 of "features/03-your-profile"): each of the
-- member's top 3 photos goes first for a week, and the week's likes and
-- matches are counted. One row per week; a test's three rows share test_id.
--
-- Additions only. Nothing stored is renamed or dropped.

CREATE TABLE IF NOT EXISTS "date_photo_tests" (
  "id" varchar(36) PRIMARY KEY,
  "test_id" varchar(36) NOT NULL,
  "account_id" varchar(36) NOT NULL REFERENCES "date_accounts"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" varchar(36) NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "place" integer NOT NULL CHECK ("place" BETWEEN 1 AND 3),
  "photo_id" varchar(36) NOT NULL,
  "original_order" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "started_at" timestamptz,
  "ended_at" timestamptz,
  "likes" integer NOT NULL DEFAULT 0 CHECK ("likes" >= 0),
  "matches" integer NOT NULL DEFAULT 0 CHECK ("matches" >= 0),
  "winner" boolean NOT NULL DEFAULT false,
  "put_first_at" timestamptz,
  "stopped_at" timestamptz,
  "restored_at" timestamptz,
  "asked_at" timestamptz,
  "move_error" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_date_photo_tests_account" ON "date_photo_tests" ("account_id", "created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_date_photo_tests_week" ON "date_photo_tests" ("test_id", "place");
