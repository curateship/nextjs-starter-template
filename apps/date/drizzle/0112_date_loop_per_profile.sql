-- Tinder and Facebook on one phone (part 2 of "facebook/01-facebook-dating",
-- Tyler, 22 Oct 2026): the swipe loop's state belongs to the profile, not the
-- phone, so two profiles on one phone each run in their own hours and a stop
-- screen on one leaves the other alone. Each profile takes its phone's
-- current state once.
--
-- Additions only. The same columns on "date_phones" stay where they are,
-- unread from this migration on, because a stored field is never renamed or
-- dropped.

ALTER TABLE "date_accounts"
  ADD COLUMN IF NOT EXISTS "running" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "running_since" timestamptz,
  ADD COLUMN IF NOT EXISTS "stop_why" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "stop_why_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "started_by" varchar(10),
  ADD COLUMN IF NOT EXISTS "schedule_day" varchar(10) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "resume_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "discovery_owed" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "stopped_reason" varchar(40),
  ADD COLUMN IF NOT EXISTS "stopped_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "stopped_words" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "stopped_picture_id" varchar(36);

UPDATE "date_accounts" a SET
  "running" = p."running",
  "running_since" = p."running_since",
  "stop_why" = p."stop_why",
  "stop_why_at" = p."stop_why_at",
  "started_by" = p."started_by",
  "schedule_day" = p."schedule_day",
  "resume_at" = p."resume_at",
  "discovery_owed" = p."discovery_owed",
  "stopped_reason" = p."stopped_reason",
  "stopped_at" = p."stopped_at",
  "stopped_words" = p."stopped_words",
  "stopped_picture_id" = p."stopped_picture_id"
FROM "date_phones" p
WHERE a."phone_id" = p."id";
