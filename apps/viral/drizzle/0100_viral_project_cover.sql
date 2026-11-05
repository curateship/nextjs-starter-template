-- A Viral project's own cover photo, set from the ⋮ on the project page's
-- left panel (Tyler, 4 Nov 2026: "there is no image for left panel top bg").
-- cover_chosen marks a cover someone picked, so a finished search no longer
-- swaps it for the best result's thumbnail. The sample project gets a photo,
-- because its made-up videos have no thumbnails to borrow.
--
-- Task: workspace/tasks/viral-research/01-viral-research-app.md, part 3.

ALTER TABLE "viral_projects" ADD COLUMN IF NOT EXISTS "cover_chosen" boolean NOT NULL DEFAULT false;

UPDATE "viral_projects"
SET "cover_url" = 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1200&q=80', "cover_chosen" = true
WHERE "is_sample" = true AND "cover_url" IS NULL;
