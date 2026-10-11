-- The rest of Tyler's Team dashboard mockup (Team dashboard tasks 01 and 02):
-- meetings on the calendar, a team photo, and typed check-in notes.

-- A meeting belongs to the team, and everyone on the team sees it. Its day and
-- times are wall-clock times in `time_zone`, the team's zone when it was made,
-- so "Mondays at 10:00" stays 10:00 in that city across a clock change.
-- `repeat_every` is null for a one-off, 'week', or 'two_weeks'; a repeat falls
-- on the same weekday as `day`.
CREATE TABLE IF NOT EXISTS "project_meetings" (
  "id" varchar(36) PRIMARY KEY,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "color" varchar(16) NOT NULL,
  "day" date NOT NULL,
  "start_time" varchar(5) NOT NULL,
  "end_time" varchar(5) NOT NULL,
  "time_zone" text NOT NULL,
  "repeat_every" varchar(16),
  "video_url" text,
  "created_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_project_meetings_team" ON "project_meetings" ("team_id", "day");

-- The people invited to a meeting.
CREATE TABLE IF NOT EXISTS "project_meeting_people" (
  "meeting_id" varchar(36) NOT NULL REFERENCES "project_meetings" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("meeting_id", "user_id")
);

-- The team's photo: an address from the shared media library, checked to be
-- the uploader's own picture when it is saved.
ALTER TABLE "project_teams" ADD COLUMN IF NOT EXISTS "photo_url" text;

-- A check-in's three short notes, in the person's own words. Each is optional
-- and changeable during the day. A Blocker note marks the person blocked.
ALTER TABLE "project_checkins"
  ADD COLUMN IF NOT EXISTS "note_yesterday" text,
  ADD COLUMN IF NOT EXISTS "note_today" text,
  ADD COLUMN IF NOT EXISTS "note_blocker" text;
