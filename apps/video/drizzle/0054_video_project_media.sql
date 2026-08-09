-- Media uploaded inside an editor belongs to that one video project or
-- carousel. The media row stays independent, so deleting a document never
-- destroys a file that another saved document still references.

CREATE TABLE IF NOT EXISTS "video_project_media" (
  "project_id" varchar(36) NOT NULL REFERENCES "video_projects" ("id") ON DELETE CASCADE,
  "media_id" varchar(36) NOT NULL REFERENCES "media" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("project_id", "media_id")
);

CREATE INDEX IF NOT EXISTS "ix_video_project_media_media_id"
  ON "video_project_media" ("media_id");

CREATE TABLE IF NOT EXISTS "video_carousel_media" (
  "carousel_id" varchar(36) NOT NULL REFERENCES "video_carousels" ("id") ON DELETE CASCADE,
  "media_id" varchar(36) NOT NULL REFERENCES "media" ("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("carousel_id", "media_id")
);

CREATE INDEX IF NOT EXISTS "ix_video_carousel_media_media_id"
  ON "video_carousel_media" ("media_id");
