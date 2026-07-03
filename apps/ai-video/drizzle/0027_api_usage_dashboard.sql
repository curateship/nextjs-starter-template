CREATE TABLE IF NOT EXISTS "api_usage_limits" (
  "key" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) REFERENCES "users"("id") ON DELETE CASCADE,
  "monthly_credits" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "api_usage_limits_positive" CHECK ("monthly_credits" > 0),
  CONSTRAINT "api_usage_limits_user_unique" UNIQUE ("user_id")
);

CREATE INDEX IF NOT EXISTS "ix_api_usage_limits_user_id"
  ON "api_usage_limits" ("user_id");

INSERT INTO "api_usage_limits" (
  "key",
  "user_id",
  "monthly_credits",
  "created_at",
  "updated_at"
)
VALUES ('default', NULL, 1000, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

CREATE TABLE IF NOT EXISTS "api_usage_events" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" varchar(20) NOT NULL,
  "feature" varchar(40) NOT NULL,
  "model" varchar(100),
  "credits" integer NOT NULL,
  "status" varchar(20) NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "api_usage_provider_check" CHECK ("provider" in ('gemini', 'openai', 'veo', 'elevenlabs')),
  CONSTRAINT "api_usage_feature_check" CHECK ("feature" in ('text_generation', 'caption_generation', 'video_analysis', 'voiceover', 'image_generation', 'ai_video_generation', 'script_generation', 'carousel_generation', 'export_description')),
  CONSTRAINT "api_usage_status_check" CHECK ("status" in ('success', 'failed', 'blocked')),
  CONSTRAINT "api_usage_credits_positive" CHECK ("credits" > 0)
);

CREATE INDEX IF NOT EXISTS "ix_api_usage_events_user_period"
  ON "api_usage_events" ("user_id", "period_start");
CREATE INDEX IF NOT EXISTS "ix_api_usage_events_period_created"
  ON "api_usage_events" ("period_start", "created_at");
CREATE INDEX IF NOT EXISTS "ix_api_usage_events_provider"
  ON "api_usage_events" ("provider");
CREATE INDEX IF NOT EXISTS "ix_api_usage_events_feature"
  ON "api_usage_events" ("feature");

CREATE TABLE IF NOT EXISTS "api_usage_alerts" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "period_start" timestamp with time zone NOT NULL,
  "level" varchar(20) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "api_usage_alert_level_check" CHECK ("level" in ('warning', 'blocked')),
  CONSTRAINT "api_usage_alerts_user_period_level_unique" UNIQUE ("user_id", "period_start", "level")
);

CREATE INDEX IF NOT EXISTS "ix_api_usage_alerts_user_period"
  ON "api_usage_alerts" ("user_id", "period_start");

ALTER TABLE "notifications"
  ADD COLUMN "api_usage_level" varchar(20),
  ADD COLUMN "api_usage_period_start" timestamp with time zone,
  ADD COLUMN "api_usage_used_credits" integer,
  ADD COLUMN "api_usage_limit_credits" integer;

ALTER TABLE "notifications"
  DROP CONSTRAINT "notifications_type_check";

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_type_check"
  CHECK ("type" in ('feedback_vote', 'feedback_comment', 'creator_watch', 'api_usage_alert'));

UPDATE "workspaces"
SET "settings" = jsonb_set(
  "settings",
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN section->>'id' = 'section-platform-settings'
          THEN jsonb_set(
            section,
            '{entries}',
            COALESCE(section->'entries', '[]'::jsonb) || '[{"type":"item","id":"item-api-usage","label":"API Usage","href":"/admin/api-usage","icon":"barChart3","visible":true}]'::jsonb
          )
        ELSE section
      END
    )
    FROM jsonb_array_elements(COALESCE("settings"->'sections', '[]'::jsonb)) AS section
  ),
  true
)
WHERE NOT EXISTS (
  SELECT 1
  FROM jsonb_array_elements(COALESCE("settings"->'sections', '[]'::jsonb)) AS section
  CROSS JOIN jsonb_array_elements(COALESCE(section->'entries', '[]'::jsonb)) AS entry
  WHERE entry->>'id' = 'item-api-usage'
);
