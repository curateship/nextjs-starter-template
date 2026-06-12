CREATE TABLE IF NOT EXISTS "viral_videos" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_url" text NOT NULL,
  "platform" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL,
  "error" text,
  "media_id" varchar(36) REFERENCES "media"("id") ON DELETE SET NULL,
  "title" varchar(500),
  "author" varchar(255),
  "duration_ms" integer,
  "stats" jsonb,
  "analysis" jsonb,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "viral_videos_platform_check" CHECK ("platform" in ('tiktok', 'instagram')),
  CONSTRAINT "viral_videos_status_check" CHECK ("status" in ('downloading', 'analyzing', 'ready', 'error'))
);

CREATE INDEX IF NOT EXISTS "ix_viral_videos_user_id" ON "viral_videos" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_viral_videos_user_created" ON "viral_videos" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_viral_videos_media_id" ON "viral_videos" ("media_id");

CREATE TABLE IF NOT EXISTS "video_templates" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "source_viral_video_id" varchar(36) REFERENCES "viral_videos"("id") ON DELETE SET NULL,
  "timeline" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_video_templates_user_id" ON "video_templates" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_video_templates_user_created" ON "video_templates" ("user_id", "created_at");
