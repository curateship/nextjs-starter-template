-- The trading engine's switches, and the heartbeat it writes while it lives.
--
-- One engine, so one control row — seeded here so the page has something to
-- show before the worker has ever started.

CREATE TABLE IF NOT EXISTS "trade_worker_controls" (
  "kind" varchar(30) PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "paused" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "trade_worker_heartbeats" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "kind" varchar(30) NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone NOT NULL,
  "role" varchar(10) NOT NULL,
  "meta" jsonb
);

CREATE INDEX IF NOT EXISTS "trade_worker_heartbeats_seen_idx"
  ON "trade_worker_heartbeats" ("last_seen_at");

INSERT INTO "trade_worker_controls" ("kind", "enabled", "paused")
VALUES ('ladders', true, false)
ON CONFLICT ("kind") DO NOTHING;
