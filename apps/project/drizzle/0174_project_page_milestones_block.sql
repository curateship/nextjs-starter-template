-- A project's milestones leave the foot of its left panel and become a "/"
-- block on its page (Tyler, 9 Nov 2026: "remove the details card and make
-- milestone a block"). Every shared project's page gets the Milestones block
-- at its end, so its milestones still show; a "Just me" list has no page.
-- Only a page saved as a block document is changed: one saved as plain
-- words, from before pages held blocks, is left alone, so it is never read
-- as JSON here.
UPDATE "project_projects"
SET "notes" = CASE
    WHEN "notes" = '' THEN '{"type":"doc","content":[{"type":"noteMilestones"}]}'
    ELSE jsonb_set(
      "notes"::jsonb,
      '{content}',
      COALESCE("notes"::jsonb -> 'content', '[]'::jsonb) || '[{"type":"noteMilestones"}]'::jsonb
    )::text
  END
WHERE "personal_user_id" IS NULL
  AND ("notes" = '' OR ("notes" ~ '^\{\s*"type"\s*:\s*"doc"' AND "notes" NOT LIKE '%"noteMilestones"%'));
