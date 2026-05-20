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
