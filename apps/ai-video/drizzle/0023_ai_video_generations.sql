CREATE TABLE IF NOT EXISTS "ai_video_generations" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "video_projects"("id") ON DELETE CASCADE,
  "first_frame_id" varchar(36) NOT NULL REFERENCES "first_frames"("id") ON DELETE CASCADE,
  "first_frame_media_id" varchar(36) REFERENCES "media"("id") ON DELETE SET NULL,
  "prompt" text NOT NULL,
  "model" varchar(100) NOT NULL,
  "aspect_ratio" varchar(10) NOT NULL,
  "duration_seconds" integer NOT NULL,
  "resolution" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL,
  "operation_name" text,
  "requested_playhead_ms" integer NOT NULL,
  "media_id" varchar(36) REFERENCES "media"("id") ON DELETE SET NULL,
  "error_message" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ai_video_generations_status_check" CHECK ("status" in ('queued', 'processing', 'ready', 'error')),
  CONSTRAINT "ai_video_generations_aspect_ratio_check" CHECK ("aspect_ratio" in ('9:16', '16:9')),
  CONSTRAINT "ai_video_generations_duration_check" CHECK ("duration_seconds" in (4, 6, 8))
);

CREATE INDEX IF NOT EXISTS "ix_ai_video_generations_user_id" ON "ai_video_generations" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_ai_video_generations_project_id" ON "ai_video_generations" ("project_id");
CREATE INDEX IF NOT EXISTS "ix_ai_video_generations_first_frame_id" ON "ai_video_generations" ("first_frame_id");
CREATE INDEX IF NOT EXISTS "ix_ai_video_generations_media_id" ON "ai_video_generations" ("media_id");
CREATE INDEX IF NOT EXISTS "ix_ai_video_generations_project_updated" ON "ai_video_generations" ("project_id", "updated_at");
