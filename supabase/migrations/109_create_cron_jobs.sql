-- Cron jobs registry and run history
CREATE TABLE IF NOT EXISTS cron_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  schedule VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cron_jobs_enabled ON cron_jobs(enabled);
CREATE INDEX idx_cron_jobs_next_run ON cron_jobs(next_run_at);

CREATE TABLE IF NOT EXISTS cron_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES cron_jobs(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL,
  duration_ms INTEGER,
  response TEXT,
  http_status INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cron_job_runs_job ON cron_job_runs(job_id);
CREATE INDEX idx_cron_job_runs_started ON cron_job_runs(started_at);

-- Seed the 3 existing cron jobs
INSERT INTO cron_jobs (name, endpoint, schedule, enabled) VALUES
  ('Newsletter Sends', '/api/cron/newsletters', '*/5 * * * *', true),
  ('Email Automations', '/api/cron/email-automations', '*/5 * * * *', true),
  ('Engagement Scoring', '/api/cron/engagement', '0 * * * *', true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_cron_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cron_jobs_updated_at
  BEFORE UPDATE ON cron_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_cron_jobs_updated_at();
