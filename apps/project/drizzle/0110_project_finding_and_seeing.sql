-- Finding and seeing work (More features task 04).

-- A person's own saved filters, named, on one project's Board and List
-- (`project_id` set) or on My tasks (`project_id` null). Nobody else sees
-- them. `filters` holds the same values the address carries (q, status,
-- person, label, type), and `names` the person's and label's names at the
-- time, so a view naming someone who has since left can say who it was.
CREATE TABLE IF NOT EXISTS "project_saved_views" (
  "id" varchar(36) PRIMARY KEY,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "project_id" varchar(36) REFERENCES "project_projects" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "filters" jsonb NOT NULL,
  "names" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "ix_project_saved_views_owner"
  ON "project_saved_views" ("user_id", "project_id");

-- The search in the header looks for words anywhere in a title or the notes,
-- across every project a person can see. A trigram index is what makes
-- "%logo%" fast on a big team; a plain index only helps words at the start.
-- Each word is "in the title or in the notes", so both columns need one for
-- the database to use either. The in-memory database the tests use can't
-- load the extension, so there the search runs without the indexes and gives
-- the same answers.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS "ix_project_tasks_title_trgm"
    ON "project_tasks" USING gin ("title" gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS "ix_project_tasks_notes_trgm"
    ON "project_tasks" USING gin ("notes" gin_trgm_ops);
EXCEPTION
  WHEN undefined_file OR feature_not_supported OR insufficient_privilege THEN
    RAISE NOTICE 'pg_trgm is not available; the task search runs without its index.';
END
$$;
