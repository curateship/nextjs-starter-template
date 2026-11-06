-- Commenting inside a project (workspace/tasks/Projects/commenting-dashboard.md).
-- Tyler, 5 Nov 2026: "Every middle panel clicking from the left panel should
-- show my own posts but reddit, medium, x and linkedin are showing search to
-- comments." Then: "I think its better that commenting lives within its
-- project. Make each network have its own card and inside that cade have 2
-- rows, one for posts and one for commenting".

-- The networks whose commenting is paused on a project (part 20), from the
-- Pause on a network card's Commenting row. A comment,
-- an answer, a response, a reply or a connection request waits while its
-- network's commenting is paused; the project's own posts keep going out.
ALTER TABLE "promo_projects" ADD COLUMN IF NOT EXISTS "paused_commenting" jsonb NOT NULL DEFAULT '[]'::jsonb;
