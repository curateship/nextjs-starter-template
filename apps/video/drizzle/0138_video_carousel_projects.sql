-- Carousels in projects (workspace/tasks/carousels/01-carousel-features.md,
-- part 21; workspace/docs/carousel-projects.md).
--
-- A carousel can belong to one of its owner's video projects. "Make a
-- carousel" from a project's first frames sets it, and the project lists its
-- carousels. Deleting the project asks each time whether to keep its
-- carousels or delete them; a kept one has its project cleared, which is
-- what ON DELETE SET NULL does if a project goes any other way.
--
-- Additions only. Every carousel saved before this belongs to no project.
ALTER TABLE "video_carousels"
  ADD COLUMN IF NOT EXISTS "project_id" varchar(36)
  REFERENCES "video_projects"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "ix_video_carousels_project"
  ON "video_carousels" ("project_id")
  WHERE "project_id" IS NOT NULL;
