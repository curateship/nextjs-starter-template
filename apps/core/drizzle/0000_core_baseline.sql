CREATE TABLE IF NOT EXISTS "users" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL,
  "name" varchar(255) NOT NULL,
  "role" varchar(50) NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE INDEX IF NOT EXISTS "ix_users_email" ON "users" ("email");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);

CREATE INDEX IF NOT EXISTS "ix_sessions_user_id" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_sessions_token_hash" ON "sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "ix_sessions_expires_at" ON "sessions" ("expires_at");

CREATE TABLE IF NOT EXISTS "settings" (
  "key" text PRIMARY KEY NOT NULL,
  "settings" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "settings_default_key" CHECK ("key" = 'default')
);

CREATE TABLE IF NOT EXISTS "feedback" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,
  "message" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "feedback_type_check" CHECK ("type" in ('suggestion', 'bug_report', 'question', 'praise'))
);

CREATE INDEX IF NOT EXISTS "ix_feedback_user_id" ON "feedback" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_feedback_type" ON "feedback" ("type");

CREATE TABLE IF NOT EXISTS "feedback_votes" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "feedback_id" varchar(36) NOT NULL REFERENCES "feedback"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "feedback_votes_unique_user" UNIQUE("feedback_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "ix_feedback_votes_feedback_id" ON "feedback_votes" ("feedback_id");
CREATE INDEX IF NOT EXISTS "ix_feedback_votes_user_id" ON "feedback_votes" ("user_id");

CREATE TABLE IF NOT EXISTS "feedback_comments" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "feedback_id" varchar(36) NOT NULL REFERENCES "feedback"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_feedback_comments_feedback_id" ON "feedback_comments" ("feedback_id");
CREATE INDEX IF NOT EXISTS "ix_feedback_comments_user_id" ON "feedback_comments" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_feedback_comments_created_at" ON "feedback_comments" ("created_at");

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "recipient_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "actor_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "feedback_id" varchar(36) NOT NULL REFERENCES "feedback"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,
  "feedback_vote_id" varchar(36) REFERENCES "feedback_votes"("id") ON DELETE CASCADE,
  "feedback_comment_id" varchar(36) REFERENCES "feedback_comments"("id") ON DELETE CASCADE,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "notifications_type_check" CHECK ("type" in ('feedback_vote', 'feedback_comment'))
);

CREATE INDEX IF NOT EXISTS "ix_notifications_recipient_created" ON "notifications" ("recipient_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_notifications_feedback_id" ON "notifications" ("feedback_id");
CREATE INDEX IF NOT EXISTS "ix_notifications_vote_id" ON "notifications" ("feedback_vote_id");
CREATE INDEX IF NOT EXISTS "ix_notifications_comment_id" ON "notifications" ("feedback_comment_id");

CREATE TABLE IF NOT EXISTS "media" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "filename" varchar(255) NOT NULL,
  "original_name" varchar(255) NOT NULL,
  "alt_text" text,
  "file_size" bigint NOT NULL,
  "mime_type" varchar(255) NOT NULL,
  "file_type" varchar(20) NOT NULL,
  "storage_path" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "media_storage_path_unique" UNIQUE("storage_path"),
  CONSTRAINT "media_file_type_check" CHECK ("file_type" in ('image', 'video'))
);

CREATE INDEX IF NOT EXISTS "ix_media_user_id" ON "media" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_media_file_type" ON "media" ("file_type");
CREATE INDEX IF NOT EXISTS "ix_media_created_at" ON "media" ("created_at");
CREATE INDEX IF NOT EXISTS "ix_media_user_type_created" ON "media" ("user_id", "file_type", "created_at");

CREATE TABLE IF NOT EXISTS "proxies" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "protocol" varchar(10) NOT NULL,
  "host" varchar(255) NOT NULL,
  "port" integer NOT NULL,
  "username" text DEFAULT '' NOT NULL,
  "password_encrypted" text,
  "connection_type" varchar(20),
  "country" varchar(100),
  "enabled" boolean DEFAULT true NOT NULL,
  "last_status" varchar(20) DEFAULT 'untested' NOT NULL,
  "last_checked_at" timestamp with time zone,
  "last_response_ms" integer,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "proxies_unique_endpoint" UNIQUE("host", "port", "username"),
  CONSTRAINT "proxies_protocol_check" CHECK ("protocol" in ('http', 'https')),
  CONSTRAINT "proxies_port_check" CHECK ("port" between 1 and 65535),
  CONSTRAINT "proxies_connection_type_check" CHECK ("connection_type" is null or "connection_type" in ('residential', 'mobile', 'datacenter')),
  CONSTRAINT "proxies_last_status_check" CHECK ("last_status" in ('untested', 'online', 'offline'))
);

CREATE INDEX IF NOT EXISTS "ix_proxies_enabled" ON "proxies" ("enabled");
CREATE INDEX IF NOT EXISTS "ix_proxies_last_status" ON "proxies" ("last_status");
CREATE INDEX IF NOT EXISTS "ix_proxies_country" ON "proxies" ("country");
CREATE INDEX IF NOT EXISTS "ix_proxies_connection_type" ON "proxies" ("connection_type");
