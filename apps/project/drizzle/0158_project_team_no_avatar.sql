-- Teams have no avatar (Tyler, 7 Nov 2026: "we need to remove avatar"). It had
-- already left the Team dashboard's left panel, so the column goes too;
-- Project holds only test data, so nothing is kept. The Teams dashboard shows
-- each team by its name.
ALTER TABLE "project_teams" DROP COLUMN IF EXISTS "avatar_url";
