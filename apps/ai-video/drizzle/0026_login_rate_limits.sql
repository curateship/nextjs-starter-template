CREATE TABLE IF NOT EXISTS login_rate_limits (
  key varchar(64) PRIMARY KEY,
  failures jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
