-- Sections are gone and tags (the old labels) take their place (Tyler,
-- 19 Oct 2026: "remove the section and replace with multiselect tags"). Each
-- task's section becomes a tag of the same name, so nothing is lost, and the
-- same is done inside saved templates. A tag name is at most 40 characters,
-- a section's 60, so a longer name is cut. `project_sections` and
-- `project_tasks.section_id` stay as history and are no longer read.

-- 1. A tag for every section name a team doesn't have yet, from projects and templates.
INSERT INTO "project_labels" ("id", "team_id", "name", "color", "created_at")
SELECT gen_random_uuid()::text, "team_id", "name", 'slate', now()
FROM (
  SELECT DISTINCT ON ("team_id", lower("name")) "team_id", "name"
  FROM (
    SELECT p."team_id", left(trim(s."name"), 40) AS "name"
    FROM "project_sections" s
    JOIN "project_projects" p ON p."id" = s."project_id"
    UNION ALL
    SELECT t."team_id", left(trim(section."name"), 40)
    FROM "project_templates" t
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(t."content"->'sections', '[]'::jsonb)) AS section("name")
  ) names
  WHERE "name" <> ''
  ORDER BY "team_id", lower("name")
) wanted
WHERE NOT EXISTS (
  SELECT 1 FROM "project_labels" l
  WHERE l."team_id" = wanted."team_id" AND lower(l."name") = lower(wanted."name")
);

-- 2. Each task that sat in a section gets that section's tag.
INSERT INTO "project_task_labels" ("task_id", "label_id")
SELECT t."id", l."id"
FROM "project_tasks" t
JOIN "project_sections" s ON s."id" = t."section_id"
JOIN "project_projects" p ON p."id" = t."project_id"
JOIN "project_labels" l ON l."team_id" = p."team_id" AND lower(l."name") = lower(left(trim(s."name"), 40))
ON CONFLICT DO NOTHING;

-- 3. Saved templates: a task's section becomes one more tag id, and the plan's section list goes.
UPDATE "project_templates" t
SET "content" = jsonb_set(
  t."content" - 'sections',
  '{tasks}',
  (
    SELECT coalesce(jsonb_agg(
      CASE
        WHEN jsonb_typeof(task->'section') = 'number' AND tag."id" IS NOT NULL
          THEN (task - 'section') || jsonb_build_object(
            'labelIds', coalesce(task->'labelIds', '[]'::jsonb) || to_jsonb(tag."id")
          )
        ELSE task - 'section'
      END
      ORDER BY place
    ), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(t."content"->'tasks', '[]'::jsonb)) WITH ORDINALITY AS item(task, place)
    LEFT JOIN LATERAL (
      SELECT l."id" FROM "project_labels" l
      WHERE l."team_id" = t."team_id"
        AND jsonb_typeof(task->'section') = 'number'
        AND lower(l."name") = lower(left(trim(t."content"->'sections'->>((task->>'section')::int)), 40))
      LIMIT 1
    ) tag ON true
  )
)
WHERE t."content" ? 'sections';
