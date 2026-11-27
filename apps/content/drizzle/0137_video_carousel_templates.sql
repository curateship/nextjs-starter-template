-- Start from a template (workspace/tasks/carousels/01-carousel-features.md,
-- part 20; workspace/docs/carousel-templates.md).
--
-- Any carousel can be marked as a template. New carousel then offers
-- "Blank or a template?", and starting from one makes a copy, so the
-- template itself is never changed by the carousel made from it. A template
-- stays on the Carousels list, marked as one, so it can be edited and
-- unmarked like any carousel.
--
-- Additions only. Every carousel saved before this is not a template.
ALTER TABLE "video_carousels"
  ADD COLUMN IF NOT EXISTS "is_template" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "ix_video_carousels_user_templates"
  ON "video_carousels" ("user_id")
  WHERE "is_template";
