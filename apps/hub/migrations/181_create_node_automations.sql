-- Hard replacement for the old prompt/reference AI automation feature.
-- Newsletter email automations use separate tables and are intentionally untouched.

CREATE TABLE site_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_run_status varchar(20),
  lock_token varchar(120),
  lock_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_automations_status_check CHECK (status in ('draft', 'active', 'paused')),
  CONSTRAINT site_automations_last_run_status_check CHECK (last_run_status is null or last_run_status in ('running', 'success', 'partial', 'failed', 'noop'))
);

CREATE INDEX idx_site_automations_site_updated ON site_automations(site_id, updated_at);
CREATE INDEX idx_site_automations_status ON site_automations(status);
CREATE INDEX idx_site_automations_next_run ON site_automations(next_run_at);

CREATE TABLE site_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES site_automations(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'running',
  trigger_type varchar(20) NOT NULL,
  graph_snapshot jsonb NOT NULL,
  error text,
  duration_ms integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT site_automation_runs_status_check CHECK (status in ('running', 'success', 'partial', 'failed', 'noop')),
  CONSTRAINT site_automation_runs_trigger_check CHECK (trigger_type in ('manual', 'schedule'))
);

CREATE INDEX idx_site_automation_runs_automation_started ON site_automation_runs(automation_id, started_at);

CREATE TABLE site_automation_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES site_automation_runs(id) ON DELETE CASCADE,
  node_id varchar(64) NOT NULL,
  node_kind varchar(20) NOT NULL,
  node_name varchar(100) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  input_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  CONSTRAINT site_automation_run_steps_kind_check CHECK (node_kind in ('time', 'scraper', 'router', 'agent', 'post')),
  CONSTRAINT site_automation_run_steps_status_check CHECK (status in ('pending', 'running', 'success', 'failed', 'skipped'))
);

CREATE UNIQUE INDEX idx_site_automation_run_steps_node_unique ON site_automation_run_steps(run_id, node_id);
CREATE INDEX idx_site_automation_run_steps_run_status ON site_automation_run_steps(run_id, status);

CREATE TABLE site_automation_source_states (
  automation_id uuid NOT NULL REFERENCES site_automations(id) ON DELETE CASCADE,
  node_id varchar(64) NOT NULL,
  url text NOT NULL,
  url_hash varchar(64) NOT NULL,
  content_hash varchar(64) NOT NULL,
  last_changed_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_automation_source_states_pkey PRIMARY KEY (automation_id, node_id, url_hash)
);

CREATE INDEX idx_site_automation_source_states_automation ON site_automation_source_states(automation_id);

-- Retire the old feature only after its replacement schema has been created.
DROP TABLE IF EXISTS ai_agent_automation_references;
DROP TABLE IF EXISTS ai_agent_automation_runs;
DROP TABLE IF EXISTS ai_agent_automations;

UPDATE cron_jobs
SET name = 'Automations', endpoint = '/api/cron/automations', schedule = '* * * * *', updated_at = now()
WHERE endpoint = '/api/cron/ai-automations';

INSERT INTO cron_jobs (name, endpoint, schedule, enabled)
SELECT 'Automations', '/api/cron/automations', '* * * * *', true
WHERE NOT EXISTS (SELECT 1 FROM cron_jobs WHERE endpoint = '/api/cron/automations');
