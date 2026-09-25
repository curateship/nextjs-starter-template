-- Carousel Studio documents. Slides are one validated JSON document so layer
-- settings can grow without a migration. Version is the compare-and-swap
-- number that stops two browser tabs from silently overwriting each other.

CREATE TABLE IF NOT EXISTS "video_carousels" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" varchar(36) NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "format" varchar(8) NOT NULL,
  "slides" jsonb NOT NULL,
  "caption" text NOT NULL DEFAULT '',
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "video_carousels_format_check"
    CHECK ("format" in ('4:5', '1:1', '9:16')),
  CONSTRAINT "video_carousels_version_check" CHECK ("version" >= 1)
);

CREATE INDEX IF NOT EXISTS "ix_video_carousels_user_updated"
  ON "video_carousels" ("user_id", "updated_at");
