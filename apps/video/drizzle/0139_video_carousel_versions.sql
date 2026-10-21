-- Earlier versions of a carousel (workspace/tasks/carousels/01-carousel-features.md,
-- part 22; workspace/docs/carousel-history.md).
--
-- The same rule as a project's history (0118): a save keeps the slides it
-- replaces when the carousel was last saved 30 minutes ago or more, or when
-- the newest version is an hour old; restoring keeps what was there first;
-- the newest 20 are kept. Deleting the carousel deletes its versions.
--
--   reason       'break', 'hourly' or 'restore', as for projects.
--   slides       The slides as they were, validated like any saved slides.
--   format       The shape they were in.
--   caption      The post caption at the time.
--   slide_count  How many slides, for the list without reading the slides.
--   saved_at     When those slides were last saved, the time the list shows.
CREATE TABLE IF NOT EXISTS "video_carousel_versions" (
  "id" varchar(36) PRIMARY KEY,
  "carousel_id" varchar(36) NOT NULL REFERENCES "video_carousels"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" varchar(16) NOT NULL,
  "slides" jsonb NOT NULL,
  "format" varchar(8) NOT NULL,
  "caption" text NOT NULL DEFAULT '',
  "slide_count" integer NOT NULL,
  "saved_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ck_video_carousel_versions_reason"
    CHECK ("reason" in ('break', 'hourly', 'restore'))
);
CREATE INDEX IF NOT EXISTS "ix_video_carousel_versions_carousel_created"
  ON "video_carousel_versions" ("carousel_id", "created_at");
