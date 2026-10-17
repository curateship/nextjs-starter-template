-- A completed automation step may carry a small JSON result for an app-owned
-- run-history view. The plain summary stays required, so older steps and node
-- kinds without a custom view keep reading exactly as they do today.
ALTER TABLE "automation_run_steps"
  ADD COLUMN IF NOT EXISTS "output" jsonb;
