create table worker_controls (
  kind varchar(30) primary key,
  enabled boolean not null default true,
  paused boolean not null default false,
  updated_at timestamp with time zone not null,
  constraint worker_controls_kind_check check (
    kind in ('bot', 'whale-scanner', 'market-scanner', 'backtest')
  )
);

-- Some databases removed these old single-purpose controls before the
-- migration ledger was introduced. Recreate empty shells when needed so the
-- one-time value transfer remains safe for both database histories.
create table if not exists scanner_control (
  id varchar(20) primary key,
  paused boolean not null default false,
  updated_at timestamp with time zone not null
);

create table if not exists market_scanner_runtime_control (
  id varchar(20) primary key,
  enabled boolean not null default true,
  updated_at timestamp with time zone not null
);

insert into worker_controls (kind, enabled, paused, updated_at)
values
  ('bot', true, false, now()),
  (
    'whale-scanner',
    true,
    coalesce((select paused from scanner_control where id = 'default'), false),
    now()
  ),
  (
    'market-scanner',
    coalesce(
      (select enabled from market_scanner_runtime_control where id = 'default'),
      true
    ),
    false,
    now()
  ),
  ('backtest', true, false, now());

alter table backtests
  add column attempt_count integer not null default 0,
  add column progress integer not null default 0,
  add column progress_stage varchar(40),
  add column claimed_by varchar(36),
  add constraint backtests_progress_check check (progress between 0 and 100);

drop table scanner_control;
drop table market_scanner_runtime_control;
