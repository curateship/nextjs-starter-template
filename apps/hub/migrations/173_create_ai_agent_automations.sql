create table if not exists ai_agent_automations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  name varchar(255) not null,
  prompt text not null default '',
  status varchar(20) not null default 'draft',
  provider varchar(50) not null default 'openai',
  model varchar(120) not null default 'gpt-5.5',
  recurrence jsonb not null default '{}'::jsonb,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_run_status varchar(20),
  lock_token varchar(120),
  lock_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_agent_automations_status_check check (status in ('draft', 'active', 'paused')),
  constraint ai_agent_automations_provider_check check (provider in ('openai', 'anthropic', 'google_ai')),
  constraint ai_agent_automations_last_run_status_check check (last_run_status is null or last_run_status in ('running', 'success', 'failed'))
);

create index if not exists idx_ai_agent_automations_site on ai_agent_automations(site_id);
create index if not exists idx_ai_agent_automations_status on ai_agent_automations(status);
create index if not exists idx_ai_agent_automations_next_run on ai_agent_automations(next_run_at);

create table if not exists ai_agent_automation_references (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references ai_agent_automations(id) on delete cascade,
  reference_type varchar(20) not null,
  label varchar(255) not null,
  source_url text,
  storage_path text,
  mime_type varchar(255),
  file_size integer,
  extracted_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_agent_automation_references_type_check check (reference_type in ('file', 'url')),
  constraint ai_agent_automation_references_source_check check (
    (reference_type = 'url' and source_url is not null) or
    (reference_type = 'file' and storage_path is not null)
  )
);

create index if not exists idx_ai_agent_automation_refs_automation on ai_agent_automation_references(automation_id);

create table if not exists ai_agent_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references ai_agent_automations(id) on delete cascade,
  status varchar(20) not null default 'running',
  trigger_type varchar(20) not null,
  provider varchar(50) not null,
  model varchar(120) not null,
  prompt_snapshot text not null default '',
  references_snapshot jsonb not null default '[]'::jsonb,
  output text,
  error text,
  duration_ms integer,
  usage jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_agent_automation_runs_status_check check (status in ('running', 'success', 'failed')),
  constraint ai_agent_automation_runs_trigger_type_check check (trigger_type in ('manual', 'schedule')),
  constraint ai_agent_automation_runs_provider_check check (provider in ('openai', 'anthropic', 'google_ai'))
);

create index if not exists idx_ai_agent_automation_runs_automation on ai_agent_automation_runs(automation_id);
create index if not exists idx_ai_agent_automation_runs_started on ai_agent_automation_runs(started_at);

create unique index if not exists idx_cron_jobs_endpoint_unique on cron_jobs(endpoint);

insert into cron_jobs (name, endpoint, schedule, enabled)
select 'AI Agent Automations', '/api/cron/ai-automations', '*/5 * * * *', true
where not exists (
  select 1 from cron_jobs where endpoint = '/api/cron/ai-automations'
);
