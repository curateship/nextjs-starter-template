-- The social half of the public profile: blocking and reporting, finding a
-- profile, following, cheering and a pact.
--
-- Everything added here is off or empty for every existing account. No
-- migration follows anybody, lists anybody, or makes a group board public.

-- ---------------------------------------------------------------------------
-- Blocking (04 part 2). Checked by one function, called from every list.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pomodoro_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "blocker_user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "blocked_user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Blocking twice is one block, decided here rather than by a read-then-write
-- that two tabs could both pass.
CREATE UNIQUE INDEX IF NOT EXISTS "pomodoro_blocks_pair_unique"
  ON "pomodoro_blocks" ("blocker_user_id", "blocked_user_id");

-- "Who has blocked me", which is half of every block check.
CREATE INDEX IF NOT EXISTS "pomodoro_blocks_blocked_idx"
  ON "pomodoro_blocks" ("blocked_user_id");

-- ---------------------------------------------------------------------------
-- Following (03 part 1) and cheers (03 part 3).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pomodoro_follows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "follower_user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "followed_user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pomodoro_follows_not_self_check"
    CHECK ("follower_user_id" <> "followed_user_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pomodoro_follows_pair_unique"
  ON "pomodoro_follows" ("follower_user_id", "followed_user_id");

CREATE INDEX IF NOT EXISTS "pomodoro_follows_followed_idx"
  ON "pomodoro_follows" ("followed_user_id");

CREATE TABLE IF NOT EXISTS "pomodoro_cheers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "from_user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "to_user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  -- One of the fixed ids in src/lib/pomodoro/cheers.ts, never free text.
  "cheer_id" varchar(40) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- The daily cap per pair is counted off this index.
CREATE INDEX IF NOT EXISTS "pomodoro_cheers_pair_created_idx"
  ON "pomodoro_cheers" ("from_user_id", "to_user_id", "created_at");

-- ---------------------------------------------------------------------------
-- Profile columns: the directory opt-in, cheers, and the operator's hide.
-- ---------------------------------------------------------------------------
ALTER TABLE "pomodoro_profiles"
  -- A second switch on top of profile_public: having a page and being in a
  -- directory are different wishes. Off for everybody, including the accounts
  -- that already switched a profile on.
  ADD COLUMN IF NOT EXISTS "listed" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "cheers_enabled" boolean DEFAULT true NOT NULL,
  -- Set when an operator hides a reported profile. The public read tests it,
  -- so a hidden profile 404s exactly as a switched-off one does.
  ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;

-- ---------------------------------------------------------------------------
-- The report queue takes profile reports (04 part 1).
--
-- One queue rather than two, because an operator already works this one. A
-- profile report has no room and, when the reader has no account, no
-- reporter, so both columns stop being required. Every row written before
-- today is a message report, which is what the default says.
-- ---------------------------------------------------------------------------
ALTER TABLE "room_reports"
  ADD COLUMN IF NOT EXISTS "kind" varchar(20) DEFAULT 'message' NOT NULL,
  ADD COLUMN IF NOT EXISTS "profile_user_id" varchar(36)
    REFERENCES "users" ("id") ON DELETE CASCADE;

ALTER TABLE "room_reports" ALTER COLUMN "room_id" DROP NOT NULL;
ALTER TABLE "room_reports" ALTER COLUMN "reporter_user_id" DROP NOT NULL;

DO $$
BEGIN
  ALTER TABLE "room_reports"
    ADD CONSTRAINT "room_reports_kind_check"
    CHECK ("kind" IN ('message', 'profile'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- A message report names its room; a profile report names whose profile it is.
DO $$
BEGIN
  ALTER TABLE "room_reports"
    ADD CONSTRAINT "room_reports_target_check"
    CHECK (("kind" = 'message' AND "room_id" IS NOT NULL)
        OR ("kind" = 'profile' AND "profile_user_id" IS NOT NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "room_reports_kind_status_idx"
  ON "room_reports" ("kind", "status", "created_at");
