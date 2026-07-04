CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  rate_key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 1,
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset_at
  ON rate_limit_buckets (reset_at);
