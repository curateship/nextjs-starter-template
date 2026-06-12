-- Projects remember which template they were created from so the script
-- writer can reach the source reel's analysis (template -> viral video).
ALTER TABLE "video_projects"
  ADD COLUMN "template_id" varchar(36) REFERENCES "video_templates"("id") ON DELETE SET NULL;

CREATE INDEX "ix_video_projects_template_id" ON "video_projects" ("template_id");

-- Best-effort backfill: "Use template" copied the template's name verbatim.
UPDATE "video_projects" p
SET "template_id" = t."id"
FROM "video_templates" t
WHERE p."user_id" = t."user_id"
  AND p."name" = t."name"
  AND p."template_id" IS NULL;
