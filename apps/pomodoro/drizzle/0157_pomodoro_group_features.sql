-- More for private focus groups (groups task 01, 13 Oct 2026): renaming, a
-- line about the group, handing it on, keeping a removed person out, pausing
-- and timing the invite link, asking the owner first, inviting people you
-- follow, group rooms, one timezone for the whole group, a weekly goal, the
-- Monday winner, milestones, the owner's activity list, and reporting a group.
--
-- Still no ranking is stored. Tyler, 13 Oct 2026: past weeks are worked out
-- from the sessions when they are read. The two small tables below that hold
-- weeks and milestones only remember that a notice was sent, so a worker pass
-- that runs twice tells nobody twice.

ALTER TABLE "pomodoro_groups"
  ADD COLUMN IF NOT EXISTS "description" varchar(120),
  -- The invite link stops letting people in while this is on, without
  -- changing, so the invites already sent work again when it is switched off.
  ADD COLUMN IF NOT EXISTS "joins_paused" boolean DEFAULT false NOT NULL,
  -- A join becomes a request the owner lets in or turns down.
  ADD COLUMN IF NOT EXISTS "approve_joins" boolean DEFAULT false NOT NULL,
  -- "After 7 days" and "After 10 joins". Both null is a link that never
  -- runs out. New link clears both.
  ADD COLUMN IF NOT EXISTS "link_expires_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "link_joins_left" integer,
  -- The calendar the group's board counts days in, so every member sees the
  -- same week. Null until the owner picks one, which reads as the owner's own.
  ADD COLUMN IF NOT EXISTS "timezone" varchar(80),
  ADD COLUMN IF NOT EXISTS "weekly_goal_hours" integer;

ALTER TABLE "pomodoro_groups" DROP CONSTRAINT IF EXISTS "pomodoro_groups_link_joins_left_check";
ALTER TABLE "pomodoro_groups"
  ADD CONSTRAINT "pomodoro_groups_link_joins_left_check"
  CHECK ("link_joins_left" IS NULL OR "link_joins_left" >= 0);
ALTER TABLE "pomodoro_groups" DROP CONSTRAINT IF EXISTS "pomodoro_groups_weekly_goal_check";
ALTER TABLE "pomodoro_groups"
  ADD CONSTRAINT "pomodoro_groups_weekly_goal_check"
  CHECK ("weekly_goal_hours" IS NULL OR "weekly_goal_hours" BETWEEN 1 AND 1000);

-- People the owner removed and kept out. The invite link refuses them until
-- the owner lets them back in, which deletes the row.
CREATE TABLE IF NOT EXISTS "pomodoro_group_bans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL
    REFERENCES "pomodoro_groups" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pomodoro_group_bans_group_user_unique" UNIQUE ("group_id", "user_id")
);

-- A join waiting for the owner. Counts toward neither cap until let in.
CREATE TABLE IF NOT EXISTS "pomodoro_group_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL
    REFERENCES "pomodoro_groups" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pomodoro_group_requests_group_user_unique" UNIQUE ("group_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "pomodoro_group_requests_user_idx"
  ON "pomodoro_group_requests" ("user_id");

-- An invite sent in the bell to somebody the sender follows. One per person
-- per group while it waits. Join or Decline sets `answered_at` rather than
-- deleting the row, because the 20-a-day limit is counted from these rows.
CREATE TABLE IF NOT EXISTS "pomodoro_group_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL
    REFERENCES "pomodoro_groups" ("id") ON DELETE CASCADE,
  "invitee_user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "inviter_user_id" varchar(36) NOT NULL
    REFERENCES "users" ("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "answered_at" timestamp with time zone,
  CONSTRAINT "pomodoro_group_invites_group_invitee_unique" UNIQUE ("group_id", "invitee_user_id")
);
-- The 20-a-day limit is counted from this.
CREATE INDEX IF NOT EXISTS "pomodoro_group_invites_inviter_idx"
  ON "pomodoro_group_invites" ("inviter_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "pomodoro_group_invites_invitee_idx"
  ON "pomodoro_group_invites" ("invitee_user_id");

-- The owner's Activity panel: joined, left, removed, renamed and the rest.
-- `name` is the words the line shows (the person or the new name), saved as
-- they were then, so no user id is needed to draw it. The last 50 per group
-- are kept.
CREATE TABLE IF NOT EXISTS "pomodoro_group_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL
    REFERENCES "pomodoro_groups" ("id") ON DELETE CASCADE,
  "kind" varchar(30) NOT NULL,
  "name" varchar(120),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pomodoro_group_events_group_created_idx"
  ON "pomodoro_group_events" ("group_id", "created_at");

-- Which milestones a group has reached, so each is sent once.
CREATE TABLE IF NOT EXISTS "pomodoro_group_milestones" (
  "group_id" uuid NOT NULL
    REFERENCES "pomodoro_groups" ("id") ON DELETE CASCADE,
  "hours" integer NOT NULL,
  "reached_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pomodoro_group_milestones_pk" PRIMARY KEY ("group_id", "hours")
);

-- Which weekly notices went out: the Monday winner and the goal reached.
-- A record that a notice was sent, not a ranking.
CREATE TABLE IF NOT EXISTS "pomodoro_group_week_notices" (
  "group_id" uuid NOT NULL
    REFERENCES "pomodoro_groups" ("id") ON DELETE CASCADE,
  "week_start" date NOT NULL,
  "kind" varchar(20) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pomodoro_group_week_notices_pk" PRIMARY KEY ("group_id", "week_start", "kind"),
  CONSTRAINT "pomodoro_group_week_notices_kind_check" CHECK ("kind" IN ('winner', 'goal'))
);

-- A group room: unlisted, shown on the members' Group room card on Rooms,
-- and only the group's members may join it (Tyler, 13 Oct 2026).
ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "group_id" uuid
    REFERENCES "pomodoro_groups" ("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "rooms_group_idx"
  ON "rooms" ("group_id")
  WHERE "group_id" IS NOT NULL;

-- A weekly group room. Each week's room is booked with the group's members
-- as they are that week.
ALTER TABLE "pomodoro_room_repeats"
  ADD COLUMN IF NOT EXISTS "group_id" uuid
    REFERENCES "pomodoro_groups" ("id") ON DELETE SET NULL;

-- Reporting a group's name or line joins the queue an operator already works.
ALTER TABLE "room_reports"
  ADD COLUMN IF NOT EXISTS "group_id" uuid
    REFERENCES "pomodoro_groups" ("id") ON DELETE CASCADE;

ALTER TABLE "room_reports" DROP CONSTRAINT IF EXISTS "room_reports_kind_check";
ALTER TABLE "room_reports"
  ADD CONSTRAINT "room_reports_kind_check"
  CHECK ("kind" IN ('message', 'profile', 'shared_file', 'copyright', 'group'));

ALTER TABLE "room_reports" DROP CONSTRAINT IF EXISTS "room_reports_target_check";
ALTER TABLE "room_reports"
  ADD CONSTRAINT "room_reports_target_check"
  CHECK (("kind" = 'message' AND "room_id" IS NOT NULL)
      OR ("kind" = 'profile' AND "profile_user_id" IS NOT NULL)
      OR ("kind" = 'shared_file' AND "media_id" IS NOT NULL)
      OR ("kind" = 'copyright' AND "contact_email" IS NOT NULL)
      OR ("kind" = 'group' AND "group_id" IS NOT NULL));
