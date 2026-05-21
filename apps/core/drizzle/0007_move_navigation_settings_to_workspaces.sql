WITH shell AS (
  SELECT "settings"
  FROM "settings"
  WHERE "key" = 'default'
)
UPDATE "workspaces"
SET
  "settings" = jsonb_strip_nulls(
    COALESCE("workspaces"."settings", '{}'::jsonb) ||
    jsonb_build_object(
      'topNavigation', shell."settings"->'topNavigation',
      'topRightNavigation', shell."settings"->'topRightNavigation',
      'sections', shell."settings"->'sections'
    )
  ),
  "updated_at" = now()
FROM shell
WHERE
  shell."settings" ? 'topNavigation' OR
  shell."settings" ? 'topRightNavigation' OR
  shell."settings" ? 'sections';

UPDATE "settings"
SET
  "settings" = "settings" - 'topNavigation' - 'topRightNavigation' - 'sections',
  "updated_at" = now()
WHERE "key" = 'default';
