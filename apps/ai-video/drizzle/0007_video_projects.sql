CREATE TABLE IF NOT EXISTS "video_projects" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "timeline" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_video_projects_user_id" ON "video_projects" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_video_projects_user_created" ON "video_projects" ("user_id", "created_at");
