CREATE TABLE IF NOT EXISTS "projects" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "domain" text NOT NULL,
  "normalized_domain" text NOT NULL,
  "location_code" integer NOT NULL,
  "location_name" text,
  "language_code" text NOT NULL,
  "language_name" text,
  "search_engine" text DEFAULT 'google' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_projects_user_id" ON "projects" ("user_id");

CREATE TABLE IF NOT EXISTS "project_competitors" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "project_id" varchar(36) NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "domain" text NOT NULL,
  "normalized_domain" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE("project_id", "normalized_domain")
);

CREATE TABLE IF NOT EXISTS "keyword_jobs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" varchar(36) NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "input" jsonb NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "current_step" text,
  "error_message" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_keyword_jobs_project_status" ON "keyword_jobs" ("project_id", "status");

CREATE TABLE IF NOT EXISTS "keywords" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "keyword" text NOT NULL,
  "normalized_keyword" text NOT NULL,
  "location_code" integer NOT NULL,
  "language_code" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE("normalized_keyword", "location_code", "language_code")
);

CREATE INDEX IF NOT EXISTS "idx_keywords_normalized" ON "keywords" ("normalized_keyword");

CREATE TABLE IF NOT EXISTS "keyword_metrics" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "keyword_id" varchar(36) NOT NULL REFERENCES "keywords"("id") ON DELETE CASCADE,
  "provider" text DEFAULT 'dataforseo' NOT NULL,
  "source_endpoint" text NOT NULL,
  "search_volume" integer,
  "monthly_searches" jsonb,
  "cpc" numeric(12,4),
  "competition" numeric(8,4),
  "competition_level" text,
  "low_top_of_page_bid" numeric(12,4),
  "high_top_of_page_bid" numeric(12,4),
  "keyword_difficulty" integer,
  "intent" text,
  "intent_probability" numeric(8,4),
  "secondary_intents" jsonb,
  "trend_score" integer,
  "serp_features" jsonb,
  "raw_response" jsonb,
  "provider_updated_at" timestamp with time zone,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE("keyword_id", "provider")
);

CREATE INDEX IF NOT EXISTS "idx_keyword_metrics_keyword_fetched" ON "keyword_metrics" ("keyword_id", "fetched_at" DESC);

CREATE TABLE IF NOT EXISTS "project_keywords" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "project_id" varchar(36) NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "keyword_id" varchar(36) NOT NULL REFERENCES "keywords"("id") ON DELETE CASCADE,
  "source" text NOT NULL,
  "source_details" jsonb,
  "status" text DEFAULT 'new' NOT NULL,
  "opportunity_score" integer,
  "score_explanation" jsonb,
  "suggested_page_type" text,
  "assigned_url" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE("project_id", "keyword_id")
);

CREATE INDEX IF NOT EXISTS "idx_project_keywords_project_status" ON "project_keywords" ("project_id", "status");
CREATE INDEX IF NOT EXISTS "idx_project_keywords_project_score" ON "project_keywords" ("project_id", "opportunity_score" DESC);

CREATE TABLE IF NOT EXISTS "api_usage_logs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "user_id" varchar(36) NOT NULL,
  "project_id" varchar(36),
  "job_id" varchar(36),
  "provider" text NOT NULL,
  "endpoint" text NOT NULL,
  "request_payload_hash" text,
  "request_count" integer DEFAULT 1 NOT NULL,
  "keyword_count" integer,
  "cost" numeric(12,6),
  "status_code" integer,
  "status_message" text,
  "success" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ix_api_usage_logs_user_created" ON "api_usage_logs" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ix_api_usage_logs_job_id" ON "api_usage_logs" ("job_id");
CREATE INDEX IF NOT EXISTS "ix_api_usage_logs_payload_hash" ON "api_usage_logs" ("request_payload_hash", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "dataforseo_locations_languages" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "location_code" integer NOT NULL,
  "location_name" text NOT NULL,
  "country_iso_code" text,
  "language_code" text NOT NULL,
  "language_name" text NOT NULL,
  "source" text DEFAULT 'google' NOT NULL,
  "keywords_count" integer,
  "serps_count" integer,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE("location_code", "language_code", "source")
);

-- Seed common locations/languages so project setup works before the first
-- DataForSEO locations sync runs.
INSERT INTO "dataforseo_locations_languages"
  ("location_code", "location_name", "country_iso_code", "language_code", "language_name")
VALUES
  (2840, 'United States', 'US', 'en', 'English'),
  (2840, 'United States', 'US', 'es', 'Spanish'),
  (2826, 'United Kingdom', 'GB', 'en', 'English'),
  (2124, 'Canada', 'CA', 'en', 'English'),
  (2124, 'Canada', 'CA', 'fr', 'French'),
  (2036, 'Australia', 'AU', 'en', 'English'),
  (2554, 'New Zealand', 'NZ', 'en', 'English'),
  (2372, 'Ireland', 'IE', 'en', 'English'),
  (2276, 'Germany', 'DE', 'de', 'German'),
  (2250, 'France', 'FR', 'fr', 'French'),
  (2724, 'Spain', 'ES', 'es', 'Spanish'),
  (2380, 'Italy', 'IT', 'it', 'Italian'),
  (2528, 'Netherlands', 'NL', 'nl', 'Dutch'),
  (2356, 'India', 'IN', 'en', 'English')
ON CONFLICT ("location_code", "language_code", "source") DO NOTHING;

-- The SEO sidebar section is owned authoritatively by migration 0007.
