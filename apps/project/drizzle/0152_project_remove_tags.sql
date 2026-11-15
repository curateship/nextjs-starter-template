-- Tags leave Project (Tyler, 6 Nov 2026: "remove the steps, timer and tags
-- feature"). Project holds only test data, so tags take their tables and
-- saved rows with them: the team's tags and which task had which. The
-- live-update trigger on a task's tags goes with its table; the function it
-- called stays, since other task tables still use it.
DROP TABLE IF EXISTS "project_task_labels";
DROP TABLE IF EXISTS "project_labels";

-- Saved views on Project's task screens forget their Tags filter, the tag's
-- name kept beside it, and a "Group by Tags". A view left with nothing to
-- show is deleted. The views live in the shell's table, so only Project's
-- screens are touched; the old Project table gets the same.
UPDATE "saved_views"
  SET "filters" = "filters" - 'label', "names" = "names" - 'label'
  WHERE ("screen" LIKE 'project:%' OR "screen" LIKE 'my-tasks:%' OR "screen" LIKE 'admin-tasks:%')
    AND ("filters"->>'label' IS NOT NULL OR "names"->>'label' IS NOT NULL);
UPDATE "saved_views"
  SET "filters" = "filters" - 'group'
  WHERE ("screen" LIKE 'project:%' OR "screen" LIKE 'my-tasks:%' OR "screen" LIKE 'admin-tasks:%')
    AND "filters"->>'group' = 'tags';
DELETE FROM "saved_views"
  WHERE ("screen" LIKE 'project:%' OR "screen" LIKE 'my-tasks:%' OR "screen" LIKE 'admin-tasks:%')
    AND "filters" = '{}'::jsonb;

UPDATE "project_saved_views"
  SET "filters" = "filters" - 'label', "names" = "names" - 'label'
  WHERE "filters"->>'label' IS NOT NULL OR "names"->>'label' IS NOT NULL;
UPDATE "project_saved_views"
  SET "filters" = "filters" - 'group'
  WHERE "filters"->>'group' = 'tags';
DELETE FROM "project_saved_views" WHERE "filters" = '{}'::jsonb;
