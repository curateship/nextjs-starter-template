-- The site admin's My dashboard (Admin task 03, Tyler, 23 Oct 2026). He wanted
-- "one list of my own" for his personal tasks, on no team. Every list in the
-- app hangs off a team, so his sits in a space of his own: a team row marked
-- with his id, which has no members and is left out of every list of teams.
-- One per site admin.
ALTER TABLE "project_teams"
  ADD COLUMN IF NOT EXISTS "personal_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "project_teams_personal_user"
  ON "project_teams" ("personal_user_id") WHERE "personal_user_id" IS NOT NULL;

-- What an employee keeps on their team row, which the site admin has none of:
-- their own time zone (null until the dashboard first saves the browser's)
-- and their Board's column order.
CREATE TABLE IF NOT EXISTS "project_site_admin_prefs" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "time_zone" text,
  "status_order" text[] NOT NULL DEFAULT '{}',
  "updated_at" timestamptz NOT NULL
);
