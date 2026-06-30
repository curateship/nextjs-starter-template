-- Runtime browser sessions: one Docker/Neko container per active profile.

CREATE TABLE IF NOT EXISTS "browser_sessions" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "profile_id" varchar(36) NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "node_id" varchar(255) NOT NULL,
  "container_id" varchar(255),
  "container_name" varchar(255) NOT NULL,
  "volume_name" varchar(255) NOT NULL,
  "stream_url" text NOT NULL,
  "stream_port" integer NOT NULL,
  "webrtc_start_port" integer NOT NULL,
  "webrtc_end_port" integer NOT NULL,
  "status" varchar(20) NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "last_active_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "browser_sessions"
    ADD CONSTRAINT "browser_sessions_status_check"
    CHECK ("status" in ('starting', 'running', 'stopping', 'stopped', 'error'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ix_browser_sessions_user_id" ON "browser_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "ix_browser_sessions_profile_id" ON "browser_sessions" ("profile_id");
CREATE INDEX IF NOT EXISTS "ix_browser_sessions_active_profile" ON "browser_sessions" ("profile_id", "ended_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ux_browser_sessions_active_profile"
  ON "browser_sessions" ("profile_id")
  WHERE "ended_at" IS NULL AND "status" IN ('starting', 'running', 'stopping');
