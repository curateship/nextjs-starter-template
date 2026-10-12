-- Chat and talking (More features task 03): live updates, reactions,
-- replies, files in messages, a chat for each project, the team's
-- announcement and earlier versions of a task's notes.

-- A project's own chat lives in the same table as a task's, so tags,
-- editing, deleting, reactions, replies and files work the same in both. A
-- message belongs to exactly one of the two: a task ("task_id") or the
-- project's chat ("project_id"). A task message never stores its project,
-- because moving the task to another project would leave it behind.
ALTER TABLE "project_task_comments"
  ALTER COLUMN "task_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "project_id" varchar(36)
    REFERENCES "project_projects" ("id") ON DELETE CASCADE,
  -- The message this one answers. Deleted messages keep their row, so a
  -- reply to one still finds it and reads "Message deleted".
  ADD COLUMN IF NOT EXISTS "reply_to_comment_id" varchar(36)
    REFERENCES "project_task_comments" ("id") ON DELETE SET NULL;

ALTER TABLE "project_task_comments"
  DROP CONSTRAINT IF EXISTS "project_task_comments_one_home";
ALTER TABLE "project_task_comments"
  ADD CONSTRAINT "project_task_comments_one_home"
    CHECK (("task_id" IS NULL) <> ("project_id" IS NULL));

CREATE INDEX IF NOT EXISTS "ix_project_task_comments_project_chat"
  ON "project_task_comments" ("project_id", "created_at")
  WHERE "project_id" IS NOT NULL;

-- Five fixed reactions, one of each per person per message. A deleted
-- message drops its reactions.
CREATE TABLE IF NOT EXISTS "project_comment_reactions" (
  "comment_id" varchar(36) NOT NULL REFERENCES "project_task_comments" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "reaction" varchar(16) NOT NULL
    CHECK ("reaction" IN ('thumbs_up', 'tick', 'eyes', 'heart', 'laugh')),
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("comment_id", "user_id", "reaction")
);

-- A file sent in a message. In a task's chat it is also one of the task's
-- files ("task_id" set); in a project's chat it belongs to the message alone.
ALTER TABLE "project_task_files"
  ALTER COLUMN "task_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "comment_id" varchar(36)
    REFERENCES "project_task_comments" ("id") ON DELETE CASCADE;

ALTER TABLE "project_task_files"
  DROP CONSTRAINT IF EXISTS "project_task_files_has_home";
ALTER TABLE "project_task_files"
  ADD CONSTRAINT "project_task_files_has_home"
    CHECK ("task_id" IS NOT NULL OR "comment_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "ix_project_task_files_comment"
  ON "project_task_files" ("comment_id")
  WHERE "comment_id" IS NOT NULL;

-- The team's one announcement, pinned by the owner or an admin. A new one
-- replaces the old; each person can hide the one showing for themselves,
-- and a new one shows again.
ALTER TABLE "project_teams"
  ADD COLUMN IF NOT EXISTS "announcement_id" varchar(36),
  ADD COLUMN IF NOT EXISTS "announcement_text" varchar(500),
  ADD COLUMN IF NOT EXISTS "announcement_by_user_id" varchar(36)
    REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "announcement_at" timestamptz;

ALTER TABLE "project_team_members"
  ADD COLUMN IF NOT EXISTS "hidden_announcement_id" varchar(36);

-- Each saved state of a task's notes, one per editing session, so an
-- accidental delete can be brought back. "session_id" is the editing
-- session that saved it; null is the notes as they were before anyone
-- edited them with versions kept. The newest row is the current notes.
CREATE TABLE IF NOT EXISTS "project_task_note_versions" (
  "id" varchar(36) PRIMARY KEY,
  "task_id" varchar(36) NOT NULL REFERENCES "project_tasks" ("id") ON DELETE CASCADE,
  "notes" text NOT NULL,
  "saved_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "saved_at" timestamptz NOT NULL,
  "session_id" varchar(36)
);

CREATE INDEX IF NOT EXISTS "ix_project_task_note_versions_task"
  ON "project_task_note_versions" ("task_id", "saved_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_task_note_versions_session"
  ON "project_task_note_versions" ("task_id", "session_id")
  WHERE "session_id" IS NOT NULL;

-- Live updates. Every change to a task, its chat, its reactions, files,
-- steps, labels or field values says "project P, task T changed" on the
-- "project_live" channel, and Project's own stream
-- (src/routes/api/project/live.ts) passes it to the browsers watching that
-- project. A trigger rather than a call in each server function, so no way
-- of changing a task can forget to say so. NOTIFY waits for the commit and
-- is dropped on a rollback. The payload is two ids, never any words.
CREATE OR REPLACE FUNCTION "project_live_say"(project_id varchar, task_id varchar)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF project_id IS NOT NULL THEN
    PERFORM pg_notify('project_live', project_id || ':' || coalesce(task_id, ''));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "project_live_task_changed"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_now record;
BEGIN
  IF TG_OP = 'DELETE' THEN row_now := OLD; ELSE row_now := NEW; END IF;
  PERFORM "project_live_say"(row_now."project_id", row_now."id");
  -- A task moved to another project leaves the old one's Board too.
  IF TG_OP = 'UPDATE' AND OLD."project_id" IS DISTINCT FROM NEW."project_id" THEN
    PERFORM "project_live_say"(OLD."project_id", OLD."id");
  END IF;
  RETURN NULL;
END;
$$;

-- A file: on a task, or sent in a project's chat with no task.
CREATE OR REPLACE FUNCTION "project_live_file_changed"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_now record;
BEGIN
  IF TG_OP = 'DELETE' THEN row_now := OLD; ELSE row_now := NEW; END IF;
  IF row_now."task_id" IS NOT NULL THEN
    PERFORM "project_live_say"(
      (SELECT t."project_id" FROM "project_tasks" t WHERE t."id" = row_now."task_id"),
      row_now."task_id"
    );
  ELSIF row_now."comment_id" IS NOT NULL THEN
    PERFORM "project_live_say"(
      (SELECT c."project_id" FROM "project_task_comments" c WHERE c."id" = row_now."comment_id"),
      NULL
    );
  END IF;
  RETURN NULL;
END;
$$;

-- For a table with a "task_id": steps, labels and field values.
CREATE OR REPLACE FUNCTION "project_live_task_part_changed"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_now record;
BEGIN
  IF TG_OP = 'DELETE' THEN row_now := OLD; ELSE row_now := NEW; END IF;
  IF row_now."task_id" IS NOT NULL THEN
    PERFORM "project_live_say"(
      (SELECT t."project_id" FROM "project_tasks" t WHERE t."id" = row_now."task_id"),
      row_now."task_id"
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "project_live_comment_changed"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_now record;
BEGIN
  IF TG_OP = 'DELETE' THEN row_now := OLD; ELSE row_now := NEW; END IF;
  IF row_now."task_id" IS NULL THEN
    PERFORM "project_live_say"(row_now."project_id", NULL);
  ELSE
    PERFORM "project_live_say"(
      (SELECT t."project_id" FROM "project_tasks" t WHERE t."id" = row_now."task_id"),
      row_now."task_id"
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "project_live_reaction_changed"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_now record;
  message record;
BEGIN
  IF TG_OP = 'DELETE' THEN row_now := OLD; ELSE row_now := NEW; END IF;
  SELECT c."task_id", coalesce(c."project_id", t."project_id") AS "project_id"
    INTO message
    FROM "project_task_comments" c
    LEFT JOIN "project_tasks" t ON t."id" = c."task_id"
    WHERE c."id" = row_now."comment_id";
  IF FOUND THEN
    PERFORM "project_live_say"(message."project_id", message."task_id");
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS "project_live_tasks" ON "project_tasks";
CREATE TRIGGER "project_live_tasks"
  AFTER INSERT OR UPDATE OR DELETE ON "project_tasks"
  FOR EACH ROW EXECUTE FUNCTION "project_live_task_changed"();

DROP TRIGGER IF EXISTS "project_live_comments" ON "project_task_comments";
CREATE TRIGGER "project_live_comments"
  AFTER INSERT OR UPDATE OR DELETE ON "project_task_comments"
  FOR EACH ROW EXECUTE FUNCTION "project_live_comment_changed"();

DROP TRIGGER IF EXISTS "project_live_reactions" ON "project_comment_reactions";
CREATE TRIGGER "project_live_reactions"
  AFTER INSERT OR UPDATE OR DELETE ON "project_comment_reactions"
  FOR EACH ROW EXECUTE FUNCTION "project_live_reaction_changed"();

DROP TRIGGER IF EXISTS "project_live_steps" ON "project_task_steps";
CREATE TRIGGER "project_live_steps"
  AFTER INSERT OR UPDATE OR DELETE ON "project_task_steps"
  FOR EACH ROW EXECUTE FUNCTION "project_live_task_part_changed"();

DROP TRIGGER IF EXISTS "project_live_files" ON "project_task_files";
CREATE TRIGGER "project_live_files"
  AFTER INSERT OR UPDATE OR DELETE ON "project_task_files"
  FOR EACH ROW EXECUTE FUNCTION "project_live_file_changed"();

DROP TRIGGER IF EXISTS "project_live_labels" ON "project_task_labels";
CREATE TRIGGER "project_live_labels"
  AFTER INSERT OR UPDATE OR DELETE ON "project_task_labels"
  FOR EACH ROW EXECUTE FUNCTION "project_live_task_part_changed"();

DROP TRIGGER IF EXISTS "project_live_field_values" ON "project_task_field_values";
CREATE TRIGGER "project_live_field_values"
  AFTER INSERT OR UPDATE OR DELETE ON "project_task_field_values"
  FOR EACH ROW EXECUTE FUNCTION "project_live_task_part_changed"();
