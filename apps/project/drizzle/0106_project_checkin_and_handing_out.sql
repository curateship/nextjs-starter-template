-- More features tasks 01 (the check-in and the day) and 02 (handing out work).

-- A reply under someone's blocker on the Team dashboard: their Blocker note
-- (`task_id` null) or a picked task that was Stuck (`task_id` set). One line
-- each. A reply to a Stuck task also goes into that task's chat.
CREATE TABLE IF NOT EXISTS "project_blocker_replies" (
  "id" varchar(36) PRIMARY KEY,
  "checkin_id" varchar(36) NOT NULL REFERENCES "project_checkins" ("id") ON DELETE CASCADE,
  "task_id" varchar(36) REFERENCES "project_tasks" ("id") ON DELETE SET NULL,
  "author_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "created_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_project_blocker_replies_checkin" ON "project_blocker_replies" ("checkin_id");

-- Who each check-in note tagged with @, per note, so an edit during the day
-- tells only the people newly tagged. `field` is yesterday, today or blocker.
CREATE TABLE IF NOT EXISTS "project_checkin_mentions" (
  "checkin_id" varchar(36) NOT NULL REFERENCES "project_checkins" ("id") ON DELETE CASCADE,
  "field" varchar(16) NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("checkin_id", "field", "user_id")
);

-- The optional evening check-out: when, and the "What's left" note, which
-- starts the next check-in's Yesterday box. Only the person ever reads it.
-- `question_labels` keeps the words the team's three boxes had that day, so a
-- past day reads under the words in use at the time.
ALTER TABLE "project_checkins"
  ADD COLUMN IF NOT EXISTS "checked_out_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "note_left" text,
  ADD COLUMN IF NOT EXISTS "question_labels" text[];

-- Each person's own order for today's picks. Null sorts after the rest.
ALTER TABLE "project_checkin_items" ADD COLUMN IF NOT EXISTS "position" integer;

-- The team's own words for the three check-in boxes (null keeps Yesterday,
-- Today and Blocker), and the starter tasks each new member gets.
ALTER TABLE "project_teams"
  ADD COLUMN IF NOT EXISTS "question_yesterday" varchar(40),
  ADD COLUMN IF NOT EXISTS "question_today" varchar(40),
  ADD COLUMN IF NOT EXISTS "question_blocker" varchar(40),
  ADD COLUMN IF NOT EXISTS "starter_tasks" text[] NOT NULL DEFAULT '{}';

-- A day off for the whole team, such as Christmas Day. On that date nobody is
-- reminded and the day is saved as a day off.
CREATE TABLE IF NOT EXISTS "project_team_holidays" (
  "id" varchar(36) PRIMARY KEY,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "name" text NOT NULL,
  "created_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_team_holidays_day" ON "project_team_holidays" ("team_id", "day");

-- One thanks per person per finished task, to whoever did it.
CREATE TABLE IF NOT EXISTS "project_task_thanks" (
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "thanked_user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("task_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "ix_project_task_thanks_thanked" ON "project_task_thanks" ("thanked_user_id", "created_at");

-- A hand-over's optional note, shown beside Waiting until it is accepted.
-- "Needs review": whoever turned it on reviews the task once it is Done, and
-- `review_waiting_since` is set while it waits. The task stays Done
-- throughout; this is a mark on Done, never a fifth status.
ALTER TABLE "project_tasks"
  ADD COLUMN IF NOT EXISTS "handover_note" text,
  ADD COLUMN IF NOT EXISTS "needs_review" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reviewer_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "review_waiting_since" timestamptz;

-- An optional warning when one person has more than this many tasks in Doing.
ALTER TABLE "project_projects" ADD COLUMN IF NOT EXISTS "doing_limit" smallint;

-- History gains a review's two moments. Saved kinds are never renamed; new
-- ones are added.
ALTER TABLE "project_task_events" DROP CONSTRAINT IF EXISTS "project_task_events_kind";
ALTER TABLE "project_task_events"
  ADD CONSTRAINT "project_task_events_kind" CHECK (
    "kind" IN (
      'handed_over', 'accepted', 'handed_back', 'became_task', 'from_step', 'moved',
      'deleted', 'restored', 'created', 'status_changed', 'commented',
      'review_confirmed', 'sent_back'
    )
  );
