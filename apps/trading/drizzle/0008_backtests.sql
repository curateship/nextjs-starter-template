-- Backtest runs: a strategy + params + market + window replayed through the
-- real strategy logic by the worker. One row per run; `result` holds the
-- BacktestResult jsonb (equity curve, trades, stats) once status = 'done'.
create table if not exists backtests (
  id varchar(36) primary key,
  user_id varchar(36) not null references users (id) on delete cascade,
  -- Re-run lineage: the first run's id; re-runs share it.
  group_id varchar(36) not null,
  name varchar(255) not null,
  strategy_type varchar(20) not null,
  market varchar(20) not null,
  network varchar(10) not null,
  interval varchar(5) not null,
  params jsonb not null,
  risk_params jsonb not null,
  -- BacktestCosts: fee/slippage assumptions in bps.
  costs jsonb not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  starting_equity numeric not null,
  status varchar(10) not null default 'pending',
  error text,
  result jsonb,
  created_at timestamp with time zone not null,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  constraint backtests_status_check
    check (status in ('pending', 'running', 'done', 'error'))
);

-- group_id and costs arrived after the first deploy; upgrade in place.
-- Pre-costs rows ran at the engine's standard fee tier — record that.
alter table backtests add column if not exists costs jsonb;
update backtests
set costs = '{"takerFeeBps": 4.5, "makerFeeBps": 1.5, "slippageBps": 0}'::jsonb
where costs is null;
alter table backtests alter column costs set not null;
alter table backtests add column if not exists group_id varchar(36);
update backtests set group_id = id where group_id is null;
alter table backtests alter column group_id set not null;

create index if not exists ix_backtests_user_id_created_at
  on backtests (user_id, created_at);
create index if not exists ix_backtests_status_created_at
  on backtests (status, created_at);
create index if not exists ix_backtests_user_id_group_id
  on backtests (user_id, group_id);

-- Per-user default parameters for each strategy: form seeds for New Run.
create table if not exists strategy_defaults (
  user_id varchar(36) not null references users (id) on delete cascade,
  strategy_type varchar(20) not null,
  params jsonb not null,
  updated_at timestamp with time zone not null,
  primary key (user_id, strategy_type),
  constraint strategy_defaults_strategy_type_check
    check (strategy_type in ('grid', 'dca', 'momentum', 'copy'))
);

-- Append the Backtest item into the existing Trading nav section (new
-- workspaces get it from createDefaultWorkspaceSections). Rebuilds the
-- sections array element-wise; idempotent via the not-exists guard.
update workspaces
set settings = jsonb_set(
  settings,
  '{sections}',
  (
    select jsonb_agg(
      case
        when section->>'id' = 'section-trading'
        then jsonb_set(
          section,
          '{entries}',
          (section->'entries') || '[{"type": "item", "id": "item-backtest", "label": "Backtest", "href": "/backtest", "icon": "flask-conical", "visible": true}]'::jsonb
        )
        else section
      end
      order by ord
    )
    from jsonb_array_elements(settings->'sections') with ordinality as t(section, ord)
  )
)
where jsonb_typeof(settings->'sections') = 'array'
  and (settings->'sections') @> '[{"id": "section-trading"}]'::jsonb
  and not exists (
    select 1
    from jsonb_array_elements(settings->'sections') as s,
         jsonb_array_elements(s->'entries') as e
    where e->>'id' = 'item-backtest'
  );

-- The strategies drill-down lives at /backtest now (it briefly had its own
-- nav item); remove item-strategies from workspaces that picked it up.
update workspaces
set settings = jsonb_set(
  settings,
  '{sections}',
  (
    select jsonb_agg(
      case
        when section->>'id' = 'section-trading'
        then jsonb_set(
          section,
          '{entries}',
          coalesce(
            (
              select jsonb_agg(entry order by entry_ord)
              from jsonb_array_elements(section->'entries')
                with ordinality as entries(entry, entry_ord)
              where entry->>'id' is distinct from 'item-strategies'
            ),
            '[]'::jsonb
          )
        )
        else section
      end
      order by ord
    )
    from jsonb_array_elements(settings->'sections') with ordinality as t(section, ord)
  )
)
where jsonb_typeof(settings->'sections') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(settings->'sections') as s,
         jsonb_array_elements(s->'entries') as e
    where e->>'id' = 'item-strategies'
  );
