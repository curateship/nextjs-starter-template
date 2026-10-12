-- A public page for a focus group, at /team/<handle> (public profile task 05,
-- 12 Oct 2026). Tyler's call: a team is a focus group whose owner switched a
-- public page on, not a new kind of thing, and only an owner on Pro can.
--
-- `handle` follows the profile handle's rules: lowercase, 3 to 30 characters,
-- unique, and null until the owner picks one. It is a separate namespace from
-- /u/<handle>, so a group and a person may hold the same word.
--
-- `page_public` is off by default, so every group that exists today stays
-- exactly as private as it was. Nothing here stores a figure: the page is the
-- leaderboard query filtered to the members who publish their own hours.
ALTER TABLE "pomodoro_groups"
  ADD COLUMN IF NOT EXISTS "handle" varchar(30),
  ADD COLUMN IF NOT EXISTS "page_public" boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "pomodoro_groups_handle_unique"
  ON "pomodoro_groups" ("handle")
  WHERE "handle" IS NOT NULL;

DO $$
BEGIN
  ALTER TABLE "pomodoro_groups"
    ADD CONSTRAINT "pomodoro_groups_handle_shape_check"
    CHECK ("handle" IS NULL OR "handle" ~ '^[a-z0-9_-]{3,30}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
