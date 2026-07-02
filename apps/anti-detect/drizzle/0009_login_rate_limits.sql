CREATE TABLE IF NOT EXISTS login_rate_limits (
  id varchar(36) PRIMARY KEY,
  rate_limit_key varchar(64) NOT NULL,
  attempted_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_login_rate_limits_key_attempted_at
  ON login_rate_limits (rate_limit_key, attempted_at);
