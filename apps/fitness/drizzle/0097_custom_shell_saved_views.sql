-- Saved views move into the shell, so every app's dashboards can keep a
-- person's named filters in one table.
--
-- Tyler, 20 Oct 2026, asked for views on Video's Viral project dashboard and
-- answered "Fix project too": Project's own project_saved_views moves onto
-- this table in a migration of Project's. `screen` names the dashboard and its
-- record (`project:<id>`, `viral-project:<id>`); the app that owns the kind
-- checks access, so there is no workspace column. A new table, so no existing
-- row changes.
CREATE TABLE IF NOT EXISTS "saved_views" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "screen" varchar(120) NOT NULL,
  "name" text NOT NULL,
  "filters" jsonb NOT NULL,
  "names" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "saved_views_user_screen_idx"
  ON "saved_views" ("user_id", "screen", "created_at");
