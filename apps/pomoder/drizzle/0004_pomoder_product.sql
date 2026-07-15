ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "public_display_name" varchar(50);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "leaderboard_opt_in" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" varchar(80) DEFAULT 'UTC' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "guest_imported_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_media_id" uuid;
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();
UPDATE "users" SET "email_verified_at" = NOW() WHERE "email_verified_at" IS NULL;

ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DEFAULT now();

CREATE TABLE IF NOT EXISTS "auth_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "purpose" varchar(20) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "auth_tokens_purpose_check" CHECK ("purpose" in ('verify_email', 'reset_password'))
);

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" varchar(180) PRIMARY KEY NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "blocked_until" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_preferences" (
  "user_id" varchar(36) PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "focus_minutes" integer DEFAULT 25 NOT NULL,
  "short_break_minutes" integer DEFAULT 5 NOT NULL,
  "long_break_minutes" integer DEFAULT 15 NOT NULL,
  "auto_start" boolean DEFAULT false NOT NULL,
  "selected_background_id" uuid,
  "selected_sound_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "preferences_focus_check" CHECK ("focus_minutes" between 1 and 90),
  CONSTRAINT "preferences_short_check" CHECK ("short_break_minutes" between 1 and 90),
  CONSTRAINT "preferences_long_check" CHECK ("long_break_minutes" between 1 and 90)
);

INSERT INTO "user_preferences" ("user_id")
SELECT "id" FROM "users"
ON CONFLICT ("user_id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" varchar(160) NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "planned_date" date NOT NULL,
  "pomodoro_count" integer DEFAULT 0 NOT NULL,
  "carried_to_task_id" uuid,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tasks_status_check" CHECK ("status" in ('active', 'completed', 'carried', 'abandoned'))
);

CREATE TABLE IF NOT EXISTS "rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "host_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slug" varchar(80) NOT NULL UNIQUE,
  "name" varchar(80) NOT NULL,
  "visibility" varchar(20) DEFAULT 'public' NOT NULL,
  "phase" varchar(20) DEFAULT 'waiting' NOT NULL,
  "sequence" integer DEFAULT 0 NOT NULL,
  "phase_started_at" timestamp with time zone,
  "phase_ends_at" timestamp with time zone,
  "focus_minutes" integer DEFAULT 25 NOT NULL,
  "short_break_minutes" integer DEFAULT 5 NOT NULL,
  "long_break_minutes" integer DEFAULT 15 NOT NULL,
  "auto_start" boolean DEFAULT false NOT NULL,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "rooms_visibility_check" CHECK ("visibility" in ('public', 'unlisted')),
  CONSTRAINT "rooms_phase_check" CHECK ("phase" in ('waiting', 'focus', 'short', 'long', 'closed'))
);

CREATE TABLE IF NOT EXISTS "focus_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "task_id" uuid REFERENCES "tasks"("id") ON DELETE SET NULL,
  "room_id" uuid REFERENCES "rooms"("id") ON DELETE SET NULL,
  "mode" varchar(20) NOT NULL,
  "status" varchar(20) DEFAULT 'running' NOT NULL,
  "planned_seconds" integer NOT NULL,
  "accumulated_seconds" integer DEFAULT 0 NOT NULL,
  "target_ends_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "idempotency_key" varchar(100) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "focus_sessions_user_idempotency_unique" UNIQUE("user_id", "idempotency_key"),
  CONSTRAINT "focus_sessions_mode_check" CHECK ("mode" in ('focus', 'short', 'long')),
  CONSTRAINT "focus_sessions_status_check" CHECK ("status" in ('running', 'paused', 'completed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS "daily_focus_stats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "local_date" date NOT NULL,
  "focus_sessions" integer DEFAULT 0 NOT NULL,
  "focus_seconds" integer DEFAULT 0 NOT NULL,
  "tasks_completed" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_focus_stats_user_date_unique" UNIQUE("user_id", "local_date")
);

CREATE TABLE IF NOT EXISTS "room_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(20) DEFAULT 'member' NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "left_at" timestamp with time zone,
  CONSTRAINT "room_memberships_role_check" CHECK ("role" in ('host', 'member'))
);

CREATE TABLE IF NOT EXISTS "room_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" varchar(500) NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "room_bans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "banned_by_user_id" varchar(36) NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "room_bans_room_user_unique" UNIQUE("room_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "room_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "reporter_user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message_id" uuid REFERENCES "room_messages"("id") ON DELETE SET NULL,
  "reason" varchar(300) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "media_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" varchar(36) REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "source" varchar(20) NOT NULL,
  "status" varchar(20) DEFAULT 'ready' NOT NULL,
  "name" varchar(100) NOT NULL,
  "storage_key" text NOT NULL UNIQUE,
  "mime_type" varchar(100) NOT NULL,
  "file_size" bigint DEFAULT 0 NOT NULL,
  "duration_seconds" integer,
  "thumbnail_key" text,
  "prompt" varchar(500),
  "provider" varchar(30),
  "provider_job_id" varchar(180),
  "premium" boolean DEFAULT false NOT NULL,
  "error_code" varchar(60),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_assets_kind_check" CHECK ("kind" in ('image', 'video', 'audio')),
  CONSTRAINT "media_assets_source_check" CHECK ("source" in ('curated', 'upload', 'ai')),
  CONSTRAINT "media_assets_status_check" CHECK ("status" in ('queued', 'processing', 'ready', 'failed'))
);

CREATE TABLE IF NOT EXISTS "generation_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "month" date NOT NULL,
  "kind" varchar(20) NOT NULL,
  "reserved" integer DEFAULT 0 NOT NULL,
  "completed" integer DEFAULT 0 NOT NULL,
  "refunded" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "generation_usage_user_month_kind_unique" UNIQUE("user_id", "month", "kind"),
  CONSTRAINT "generation_usage_kind_check" CHECK ("kind" in ('background', 'soundscape'))
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(36) NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "stripe_customer_id" varchar(120) NOT NULL UNIQUE,
  "stripe_subscription_id" varchar(120) UNIQUE,
  "status" varchar(30) NOT NULL,
  "price_id" varchar(120),
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "stripe_events" (
  "event_id" varchar(120) PRIMARY KEY NOT NULL,
  "type" varchar(120) NOT NULL,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "worker_heartbeats" (
  "worker_id" varchar(100) PRIMARY KEY NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "auth_tokens_user_purpose_idx" ON "auth_tokens" ("user_id", "purpose");
CREATE INDEX IF NOT EXISTS "tasks_user_date_idx" ON "tasks" ("user_id", "planned_date");
CREATE INDEX IF NOT EXISTS "rooms_public_idx" ON "rooms" ("visibility", "phase", "created_at");
CREATE INDEX IF NOT EXISTS "focus_sessions_user_completed_idx" ON "focus_sessions" ("user_id", "completed_at");
CREATE INDEX IF NOT EXISTS "daily_focus_stats_date_idx" ON "daily_focus_stats" ("local_date");
CREATE UNIQUE INDEX IF NOT EXISTS "room_memberships_one_active_room_per_user" ON "room_memberships" ("user_id") WHERE "left_at" IS NULL;
CREATE INDEX IF NOT EXISTS "room_memberships_room_active_idx" ON "room_memberships" ("room_id", "left_at");
CREATE INDEX IF NOT EXISTS "room_messages_room_created_idx" ON "room_messages" ("room_id", "created_at");
CREATE INDEX IF NOT EXISTS "media_assets_owner_created_idx" ON "media_assets" ("owner_user_id", "created_at");

UPDATE "workspaces"
SET "settings" = jsonb_set(
  "settings",
  '{sections}',
  COALESCE("settings"->'sections', '[]'::jsonb) || '[{"id":"section-pomoder-management","title":"Pomoder","entries":[{"type":"item","id":"item-pomoder-dashboard","label":"Dashboard","href":"/admin","icon":"layoutDashboard","visible":true},{"type":"item","id":"item-pomoder-management","label":"App Management","href":"/admin/pomoder","icon":"slidersHorizontal","visible":true}]}]'::jsonb
),
"updated_at" = NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE("settings"->'sections', '[]'::jsonb)) section
  WHERE section->>'id' = 'section-pomoder-management'
);
