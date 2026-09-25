ALTER TABLE "trade_worker_controls"
  ADD COLUMN IF NOT EXISTS "enabled_at" timestamp with time zone NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS "trade_engine_outages" (
  "kind" varchar(30) PRIMARY KEY,
  "outage_started_at" timestamp with time zone NOT NULL,
  "announced_at" timestamp with time zone NOT NULL
);
