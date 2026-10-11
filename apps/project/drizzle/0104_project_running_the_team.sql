-- Running the team (Next features task 08): a job title for each member, and
-- a link that lets people join the team.

-- A short title beside the name, such as "Copywriter". Each person sets their
-- own; the owner and admins can change anyone's.
ALTER TABLE "project_team_members" ADD COLUMN IF NOT EXISTS "title" varchar(40);

-- The team's join link. Only a fingerprint (sha256) of its secret is kept, as
-- for invites, so the link itself is shown once, when it is made. Resetting
-- or turning it off clears the fingerprint, which stops the old link at once.
ALTER TABLE "project_teams"
  ADD COLUMN IF NOT EXISTS "join_token_hash" varchar(64),
  ADD COLUMN IF NOT EXISTS "join_expires_at" timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS "ux_project_teams_join_token"
  ON "project_teams" ("join_token_hash") WHERE "join_token_hash" IS NOT NULL;

-- Each join through a link, so joins per link per day can be capped and the
-- owner and admins can see who came in that way.
CREATE TABLE IF NOT EXISTS "project_team_joins" (
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL,
  "joined_at" timestamptz NOT NULL,
  PRIMARY KEY ("team_id", "user_id", "joined_at")
);
CREATE INDEX IF NOT EXISTS "ix_project_team_joins_token"
  ON "project_team_joins" ("token_hash", "joined_at");
