-- Nine features (Features 12 Oct task 01): unread marks, planning tomorrow at
-- check-out, start dates, polls, who has seen the announcement, and the
-- team's due dates on the Team calendar.

-- How far each person has read a task's chat. A message newer than this, not
-- their own and not deleted, is new to them. With no row, the day they were
-- added to the project counts, or the day they joined the team for an owner
-- or admin who isn't on it, so nobody starts with every old message as new.
CREATE TABLE IF NOT EXISTS "project_task_reads" (
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "read_at" timestamptz NOT NULL,
  PRIMARY KEY ("task_id", "user_id")
);

-- The same for each project's own chat.
CREATE TABLE IF NOT EXISTS "project_chat_reads" (
  "project_id" varchar(36) NOT NULL REFERENCES "project_projects" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "read_at" timestamptz NOT NULL,
  PRIMARY KEY ("project_id", "user_id")
);

-- Messages written before unread marks existed count as read for everyone on
-- the team, so the first day doesn't light up every old chat.
INSERT INTO "project_task_reads" ("task_id", "user_id", "read_at")
SELECT DISTINCT c."task_id", m."user_id", now()
  FROM "project_task_comments" c
  JOIN "project_tasks" t ON t."id" = c."task_id"
  JOIN "project_projects" p ON p."id" = t."project_id"
  JOIN "project_team_members" m ON m."team_id" = p."team_id"
  WHERE c."task_id" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "project_chat_reads" ("project_id", "user_id", "read_at")
SELECT DISTINCT c."project_id", m."user_id", now()
  FROM "project_task_comments" c
  JOIN "project_projects" p ON p."id" = c."project_id"
  JOIN "project_team_members" m ON m."team_id" = p."team_id"
  WHERE c."project_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- A poll is a chat message whose words are the question. Its 2 to 6 choices
-- are fixed once it is sent.
CREATE TABLE IF NOT EXISTS "project_polls" (
  "comment_id" varchar(36) PRIMARY KEY REFERENCES "project_task_comments" ("id") ON DELETE CASCADE,
  "choices" text[] NOT NULL,
  CONSTRAINT "project_polls_choices" CHECK (cardinality("choices") BETWEEN 2 AND 6)
);

-- One vote per person per poll, which they can change. Deleting the poll's
-- message drops its votes.
CREATE TABLE IF NOT EXISTS "project_poll_votes" (
  "comment_id" varchar(36) NOT NULL REFERENCES "project_polls" ("comment_id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "choice" smallint NOT NULL,
  "voted_at" timestamptz NOT NULL,
  PRIMARY KEY ("comment_id", "user_id")
);

-- A vote reaches open pages the same way a reaction does: both rows carry the
-- message's id.
DROP TRIGGER IF EXISTS "project_live_poll_votes" ON "project_poll_votes";
CREATE TRIGGER "project_live_poll_votes"
  AFTER INSERT OR UPDATE OR DELETE ON "project_poll_votes"
  FOR EACH ROW EXECUTE FUNCTION "project_live_reaction_changed"();

-- Who has seen each announcement on the Team dashboard, once each. A new
-- announcement has a new id, so it starts again at nobody.
CREATE TABLE IF NOT EXISTS "project_announcement_views" (
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "announcement_id" varchar(36) NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "seen_at" timestamptz NOT NULL,
  PRIMARY KEY ("announcement_id", "user_id")
);

-- Each person's own "Due dates" switch on the Team calendar.
ALTER TABLE "project_team_members"
  ADD COLUMN IF NOT EXISTS "calendar_due_dates" boolean NOT NULL DEFAULT false;

-- The tasks ticked at check-out for the next check-in. Null when nothing was
-- planned, which leaves the next check-in as it always was.
ALTER TABLE "project_checkins"
  ADD COLUMN IF NOT EXISTS "tomorrow_task_ids" text[];

-- A task's optional first day, drawn with its due date on the Timeline tab.
ALTER TABLE "project_tasks"
  ADD COLUMN IF NOT EXISTS "start_date" date;
