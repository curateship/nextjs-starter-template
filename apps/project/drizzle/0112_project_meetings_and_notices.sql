-- Meetings and notices (More features task 07): answers to a meeting, notes
-- kept per date, and the bell notices each person has switched off.

-- Going or Not going, one answer per invited person. It holds for every time
-- the meeting repeats. Taking someone off the meeting deletes their answer.
CREATE TABLE IF NOT EXISTS "project_meeting_answers" (
  "meeting_id" varchar(36) NOT NULL REFERENCES "project_meetings" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "answer" varchar(16) NOT NULL,
  "answered_at" timestamptz NOT NULL,
  PRIMARY KEY ("meeting_id", "user_id"),
  CONSTRAINT "project_meeting_answers_answer" CHECK ("answer" IN ('going', 'not_going'))
);

-- A meeting's notes, one row per date it falls on, in the meeting's own
-- calendar. The notes are the shared editor's document saved as text, the
-- same as a task's.
CREATE TABLE IF NOT EXISTS "project_meeting_notes" (
  "meeting_id" varchar(36) NOT NULL REFERENCES "project_meetings" ("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "notes" text NOT NULL,
  "updated_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("meeting_id", "day")
);

-- The kinds of bell notice a person has switched off for themselves. A kind
-- with no row is on. The kinds are checked by the app, so a new kind needs no
-- change here.
CREATE TABLE IF NOT EXISTS "project_notices_off" (
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "kind" varchar(32) NOT NULL,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("user_id", "kind")
);
