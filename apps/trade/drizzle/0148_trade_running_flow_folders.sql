ALTER TABLE "trade_worker_controls"
ADD COLUMN "flow_scan_requested_at" timestamp with time zone;

ALTER TABLE "trade_flow_runs"
ADD COLUMN "market_cancels" jsonb DEFAULT '{}'::jsonb NOT NULL;
