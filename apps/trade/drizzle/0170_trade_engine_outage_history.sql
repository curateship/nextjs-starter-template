CREATE TABLE IF NOT EXISTS "trade_engine_outage_history" (
  "kind" varchar(30) NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  PRIMARY KEY ("kind", "started_at"),
  CONSTRAINT "trade_engine_outage_history_times_check" CHECK ("ended_at" >= "started_at")
);
CREATE UNIQUE INDEX IF NOT EXISTS "trade_engine_outage_history_open_idx"
  ON "trade_engine_outage_history" ("kind") WHERE "ended_at" IS NULL;
CREATE INDEX IF NOT EXISTS "trade_engine_outage_history_ended_idx"
  ON "trade_engine_outage_history" ("ended_at");

-- Preserve the outage already being monitored during the cutover.
INSERT INTO "trade_engine_outage_history" ("kind", "started_at")
  SELECT "kind", "outage_started_at" FROM "trade_engine_outages"
  ON CONFLICT DO NOTHING;
