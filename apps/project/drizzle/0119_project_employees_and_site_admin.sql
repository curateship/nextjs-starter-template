-- Employees and the site admin, 16 Oct 2026
-- (workspace/tasks/Admin/01-employees-and-the-site-admin.md).
--
-- Tyler: "I think this needs to be a shell change. We'd have admin, pro, free
-- and other types of users such as employee". Project's people become
-- accounts with Project's own `employee` role (the shell's app roles, 0094),
-- and the site admin runs every team without being on any of them.

-- Which team each site admin is looking at. One row per admin; the team
-- picker in the header changes it. A team that is deleted takes the pick with
-- it, and the next read falls back to the first team by name.
CREATE TABLE IF NOT EXISTS "project_site_admin_teams" (
  "user_id" varchar(36) PRIMARY KEY REFERENCES "users" ("id") ON DELETE CASCADE,
  "team_id" varchar(36) NOT NULL REFERENCES "project_teams" ("id") ON DELETE CASCADE,
  -- The Team calendar's "Due dates" switch, which an employee keeps on their
  -- team row and the site admin, on no team, keeps here.
  "calendar_due_dates" boolean NOT NULL DEFAULT false,
  "updated_at" timestamptz NOT NULL
);

-- The people already on a team keep their account, password, tasks and
-- history, and become employees. Admins are left as they are.
UPDATE "users"
SET "role" = 'employee', "updated_at" = now()
WHERE "role" <> 'admin'
  AND "id" IN (SELECT "user_id" FROM "project_team_members");

-- A site admin who was on a team starts their picker on it, then leaves it:
-- Tyler oversees, so he is in no member list, picker or count. Tasks that were
-- his keep his id, so they still name him.
INSERT INTO "project_site_admin_teams" ("user_id", "team_id", "updated_at")
SELECT DISTINCT ON (m."user_id") m."user_id", m."team_id", now()
FROM "project_team_members" m
JOIN "users" u ON u."id" = m."user_id"
WHERE u."role" = 'admin'
ORDER BY m."user_id", m."joined_at"
ON CONFLICT ("user_id") DO NOTHING;

DELETE FROM "project_project_members"
WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'admin')
  AND "project_id" IN (SELECT "id" FROM "project_projects" WHERE "personal_user_id" IS NULL);

DELETE FROM "project_team_members"
WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'admin');

-- Invites now make the account and put it on the team at once, so an invite
-- waiting to be accepted no longer exists, and neither does its table. The
-- ones still open go with it: the site admin invites those addresses again,
-- as employees.
DROP TABLE IF EXISTS "project_team_invites";
