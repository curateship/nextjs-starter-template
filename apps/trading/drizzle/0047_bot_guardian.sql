-- Bot guardian: an automatic account-level kill switch. One row per user
-- holds the limits (daily loss in dollars / percent, drawdown from peak),
-- the chosen action, the worker's between-tick watch state, and the tripped
-- latch that keeps the guardian off until the user re-arms it.
create table bot_guardian (
  user_id varchar(36) primary key references users(id) on delete cascade,
  enabled boolean not null default false,
  daily_loss_limit_usd numeric,
  daily_loss_limit_pct numeric,
  max_drawdown_pct numeric,
  action varchar(20) not null default 'pause_all',
  day_date date,
  day_start_equity numeric,
  peak_equity numeric,
  breach_streak integer not null default 0,
  tripped_at timestamptz,
  tripped_reason text,
  updated_at timestamptz not null,
  constraint bot_guardian_action_check check (action in ('pause_all', 'flatten_all'))
);
