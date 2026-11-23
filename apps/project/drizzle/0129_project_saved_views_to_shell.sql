-- Project's saved views move into the shell's saved_views table.
--
-- Tyler, 20 Oct 2026, when views moved into the shell for every app: "Fix
-- project too". Every row is copied with its own id, name, filters, names and
-- date, under the shell's screen key: `project:<project id>`, or
-- `my-tasks:<team id>` for a view on My tasks. project_saved_views is kept as
-- it is, never dropped; nothing writes to it after this. Running it twice
-- copies nothing new.
INSERT INTO "saved_views" ("id", "user_id", "screen", "name", "filters", "names", "created_at", "updated_at")
SELECT
  "id",
  "user_id",
  CASE
    WHEN "project_id" IS NULL THEN 'my-tasks:' || "team_id"
    ELSE 'project:' || "project_id"
  END,
  "name",
  "filters",
  "names",
  "created_at",
  "created_at"
FROM "project_saved_views"
ON CONFLICT ("id") DO NOTHING;
