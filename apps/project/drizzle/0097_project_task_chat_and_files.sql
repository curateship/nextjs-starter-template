-- A task's chat, followers and files (Next features task 01).
--
-- A message can be fixed or taken back by the person who wrote it. A deleted
-- one keeps its row with no words, so the conversation around it still reads
-- "Message deleted" where it was.
ALTER TABLE "project_task_comments"
  ADD COLUMN IF NOT EXISTS "edited_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;

-- Who each message tagged with @. Kept as rows rather than read out of the
-- words, so an edit can tell who is newly tagged and only tell them.
CREATE TABLE IF NOT EXISTS "project_comment_mentions" (
  "comment_id" varchar(36) NOT NULL REFERENCES "project_task_comments" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("comment_id", "user_id")
);

-- People following a task get its chat, Stuck and Done notices without being
-- assigned to it.
CREATE TABLE IF NOT EXISTS "project_task_followers" (
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("task_id", "user_id")
);

-- Files on a task. The file itself is in the storage bucket under
-- "storage_path", which never leaves the server: people download through
-- Project's own address, which checks they can see the task first. "team_id"
-- is copied from the project so the team's 5 GB is one sum.
CREATE TABLE IF NOT EXISTS "project_task_files" (
  "id" varchar(36) PRIMARY KEY,
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "uploaded_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "original_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL CHECK ("size_bytes" > 0),
  "storage_path" text NOT NULL,
  "created_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_project_task_files_task"
  ON "project_task_files" ("task_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_project_task_files_team"
  ON "project_task_files" ("team_id");
