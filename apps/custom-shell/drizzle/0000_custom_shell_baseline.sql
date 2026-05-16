CREATE TABLE IF NOT EXISTS "custom_shell_users" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL,
  "name" varchar(255) NOT NULL,
  "role" varchar(50) NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "custom_shell_users_email_unique" UNIQUE("email")
);

CREATE INDEX IF NOT EXISTS "ix_custom_shell_users_email" ON "custom_shell_users" ("email");

CREATE TABLE IF NOT EXISTS "custom_shell_sessions" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "custom_shell_users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "custom_shell_sessions_token_hash_unique" UNIQUE("token_hash")
);

CREATE INDEX IF NOT EXISTS "ix_custom_shell_sessions_user_id" ON "custom_shell_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_custom_shell_sessions_token_hash" ON "custom_shell_sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "ix_custom_shell_sessions_expires_at" ON "custom_shell_sessions" ("expires_at");

CREATE TABLE IF NOT EXISTS "custom_shell_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "settings" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "custom_shell_settings_default_key" CHECK ("key" = 'default')
);

CREATE TABLE IF NOT EXISTS "custom_shell_feedback" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "custom_shell_users"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,
  "message" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "custom_shell_feedback_type_check" CHECK ("type" in ('suggestion', 'bug_report', 'question', 'praise'))
);

CREATE INDEX IF NOT EXISTS "ix_custom_shell_feedback_user_id" ON "custom_shell_feedback" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_custom_shell_feedback_type" ON "custom_shell_feedback" ("type");

CREATE TABLE IF NOT EXISTS "custom_shell_feedback_votes" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "feedback_id" varchar(36) NOT NULL REFERENCES "custom_shell_feedback"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "custom_shell_users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "custom_shell_feedback_votes_unique_user" UNIQUE("feedback_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "ix_custom_shell_feedback_votes_feedback_id" ON "custom_shell_feedback_votes" ("feedback_id");
CREATE INDEX IF NOT EXISTS "ix_custom_shell_feedback_votes_user_id" ON "custom_shell_feedback_votes" ("user_id");

CREATE TABLE IF NOT EXISTS "custom_shell_media" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "custom_shell_users"("id") ON DELETE CASCADE,
  "filename" varchar(255) NOT NULL,
  "original_name" varchar(255) NOT NULL,
  "alt_text" text,
  "file_size" bigint NOT NULL,
  "mime_type" varchar(255) NOT NULL,
  "file_type" varchar(20) NOT NULL,
  "storage_path" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "custom_shell_media_storage_path_unique" UNIQUE("storage_path"),
  CONSTRAINT "custom_shell_media_file_type_check" CHECK ("file_type" in ('image', 'video'))
);

CREATE INDEX IF NOT EXISTS "ix_custom_shell_media_user_id" ON "custom_shell_media" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_custom_shell_media_file_type" ON "custom_shell_media" ("file_type");
CREATE INDEX IF NOT EXISTS "ix_custom_shell_media_created_at" ON "custom_shell_media" ("created_at");
CREATE INDEX IF NOT EXISTS "ix_custom_shell_media_user_type_created" ON "custom_shell_media" ("user_id", "file_type", "created_at");
