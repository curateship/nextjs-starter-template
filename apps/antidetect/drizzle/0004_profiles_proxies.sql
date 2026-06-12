CREATE TABLE IF NOT EXISTS "proxies" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "label" varchar(255) NOT NULL,
  "type" varchar(20) NOT NULL,
  "host" varchar(255) NOT NULL,
  "port" integer NOT NULL,
  "username" varchar(255),
  "password" text,
  "country" varchar(2),
  "last_tested_at" timestamp with time zone,
  "last_test_result" jsonb,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "proxies_type_check" CHECK ("type" in ('residential', 'mobile', 'datacenter'))
);

CREATE INDEX IF NOT EXISTS "ix_proxies_user_id" ON "proxies" ("user_id");

CREATE TABLE IF NOT EXISTS "profiles" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "status" varchar(20) DEFAULT 'stopped' NOT NULL,
  "engine" varchar(20) DEFAULT 'camoufox' NOT NULL,
  "proxy_id" varchar(36) REFERENCES "proxies"("id") ON DELETE SET NULL,
  "fingerprint" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "profiles_status_check" CHECK ("status" in ('stopped', 'starting', 'running', 'error')),
  CONSTRAINT "profiles_engine_check" CHECK ("engine" in ('camoufox', 'chromium'))
);

CREATE INDEX IF NOT EXISTS "ix_profiles_user_id" ON "profiles" ("user_id");
