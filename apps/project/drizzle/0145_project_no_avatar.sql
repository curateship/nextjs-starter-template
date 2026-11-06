-- Projects have no avatar (Tyler, 5 Nov 2026, of the Avatar row in the
-- project's ⋮ menu: "why is avatar is not removed"). It had already left the
-- left panel, so the column goes too; Project holds only test data, so
-- nothing is kept. The Dashboard's Projects card shows the colour dot.
ALTER TABLE "project_projects" DROP COLUMN IF EXISTS "avatar_url";
