-- Strategy-system rebuild, phase B groundwork. The new model: an indicator
-- computes/paints/signals; a strategy = one indicator + one universal settings
-- block, saved as a named row here; a bot snapshots that config into
-- bots.params with strategy_type = 'signal'. Legacy strategy types stay valid
-- in the CHECKs so history remains readable. Idempotent: re-runs on startup.

-- Saved, named strategies: { v: 2, interval, indicator, settings } jsonb.
create table if not exists strategies (
  id varchar(36) primary key,
  user_id varchar(36) not null references users(id) on delete cascade,
  name varchar(80) not null,
  config jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (user_id, name)
);
create index if not exists ix_strategies_user_id on strategies (user_id);

-- Bots may record which saved strategy seeded their snapshot (display only —
-- the snapshot in bots.params stays authoritative).
alter table bots add column if not exists strategy_id varchar(36)
  references strategies(id) on delete set null;

-- 'signal' joins the strategy-type CHECKs; legacy values stay so old rows
-- remain valid and readable. 'automation' is included so re-runs never fail
-- against rows created by the later automation era (every migration re-runs
-- on each db:setup); 0024 owns the final definition.
alter table bots drop constraint if exists bots_strategy_type_check;
alter table bots
  add constraint bots_strategy_type_check
  check (strategy_type in ('signal', 'automation', 'grid', 'dca', 'momentum', 'qqe', 'vwap', 'copy'));

-- The user's ONE universal settings default lives under 'universal'.
alter table strategy_defaults
  drop constraint if exists strategy_defaults_strategy_type_check;
alter table strategy_defaults
  add constraint strategy_defaults_strategy_type_check
  check (strategy_type in ('universal', 'signal', 'grid', 'dca', 'momentum', 'qqe', 'vwap', 'copy'));

-- The risk-params layer is retired for new-model rows: keep the columns for
-- legacy reads, stop requiring a value on insert.
alter table bots alter column risk_params set default '{}';
alter table backtests alter column risk_params set default '{}';
