CREATE TABLE IF NOT EXISTS "actors" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "prompt" text NOT NULL,
  "status" varchar(20) NOT NULL,
  "model" varchar(100) NOT NULL,
  "tags" jsonb NOT NULL,
  "reference_media_id" varchar(36) REFERENCES "media"("id") ON DELETE SET NULL,
  "image_storage_path" text NOT NULL,
  "image_mime_type" varchar(255) NOT NULL,
  "image_file_size" bigint NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "actors_image_storage_path_unique" UNIQUE("image_storage_path"),
  CONSTRAINT "actors_status_check" CHECK ("status" in ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS "ix_actors_user_id" ON "actors" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_actors_status" ON "actors" ("status");
CREATE INDEX IF NOT EXISTS "ix_actors_created_at" ON "actors" ("created_at");
CREATE INDEX IF NOT EXISTS "ix_actors_user_status_created" ON "actors" ("user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "ix_actors_reference_media_id" ON "actors" ("reference_media_id");
