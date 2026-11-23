-- Time off for one person (Next features task 07). On these days of their own
-- calendar there is no reminder, the missed-day row is saved as a day off,
-- and the Team dashboard reads "Away". Days already saved never change.
CREATE TABLE IF NOT EXISTS "project_time_off" (
  "id" varchar(36) PRIMARY KEY,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "first_day" date NOT NULL,
  "last_day" date NOT NULL,
  "created_by_user_id" varchar(36) REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL,
  CONSTRAINT "project_time_off_order" CHECK ("first_day" <= "last_day")
);
CREATE INDEX IF NOT EXISTS "ix_project_time_off_person"
  ON "project_time_off" ("user_id", "last_day");
