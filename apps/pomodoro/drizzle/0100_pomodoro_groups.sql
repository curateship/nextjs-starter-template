-- Private focus groups: an invite-only board among people you know, instead of
-- only the global top 100.
--
-- Two tables and nothing else. A group is a name, an owner and the secret in
-- its invite link; a membership is one row per person in it. The board itself
-- is the leaderboard query it already had, filtered to these members, so there
-- is nothing here to hold a ranking in.
--
-- The join token follows the streak badge's pattern (pomodoro_profiles.
-- streak_badge_token): 32 random bytes as 43 url-safe characters, unique so one
-- link can never point at two groups. Unlike the badge it is never null — a
-- group always has a link — and replacing it is what kills a leaked one.
--
-- Nothing here touches pomodoro_profiles.leaderboard_opt_in. Being in a group
-- is a separate opt-in from being on the global board, so joining one never
-- lists anybody publicly.
CREATE TABLE IF NOT EXISTS "pomodoro_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "join_token" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pomodoro_groups_join_token_unique" UNIQUE ("join_token")
);

-- The owner's own list of groups, read every time the leaderboard page opens.
CREATE INDEX IF NOT EXISTS "pomodoro_groups_owner_idx"
  ON "pomodoro_groups" ("owner_user_id");

CREATE TABLE IF NOT EXISTS "pomodoro_group_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL
    REFERENCES "pomodoro_groups" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- What makes "in a group once" true. Following a link twice is then a no-op
  -- rather than a second row on the board.
  CONSTRAINT "pomodoro_group_members_group_user_unique" UNIQUE ("group_id", "user_id")
);

-- "Which groups am I in", which is the first read on the page and the one the
-- five-group cap is counted from.
CREATE INDEX IF NOT EXISTS "pomodoro_group_members_user_idx"
  ON "pomodoro_group_members" ("user_id");
