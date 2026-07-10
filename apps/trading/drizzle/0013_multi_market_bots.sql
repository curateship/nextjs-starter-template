-- One bot can now trade several markets at once. The bots table moves from a
-- single `market` string to a `markets` jsonb array, gains an `exchange` field
-- (hyperliquid only today), and bot_state becomes one row per (bot, market)
-- with its own runtime status. Idempotent: this file re-runs on every startup.

-- bots: add markets + exchange, backfill from the old single market, drop it.
alter table bots add column if not exists markets jsonb;
alter table bots
  add column if not exists exchange varchar(20) not null default 'hyperliquid';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'bots' and column_name = 'market'
  ) then
    update bots set markets = jsonb_build_array(market)
      where markets is null;
    alter table bots drop column market;
  end if;
end $$;

alter table bots alter column markets set not null;

-- bot_state: add market + per-market status, backfill, switch to a composite
-- (bot_id, market) primary key.
alter table bot_state add column if not exists market varchar(20);
alter table bot_state add column if not exists status varchar(10);
alter table bot_state add column if not exists status_reason text;

update bot_state s
  set market = (b.markets ->> 0)
  from bots b
  where b.id = s.bot_id and s.market is null;

do $$
begin
  -- Only rows that actually resolved a market can take the composite key; a
  -- fresh install has no rows, so this is a no-op there.
  if exists (select 1 from bot_state where market is not null) then
    alter table bot_state alter column market set not null;
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'bot_state_pkey'
      and array_length(conkey, 1) = 1
  ) then
    alter table bot_state drop constraint bot_state_pkey;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bot_state_pkey') then
    alter table bot_state add constraint bot_state_pkey
      primary key (bot_id, market);
  end if;
end $$;

-- qqe and vwap were added to the app's strategies but never to this check
-- constraint (same gap 0010/0012 fixed for strategy_defaults/templates), so
-- creating a QQE or VWAP bot violated it. Widen to every strategy.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bots_strategy_type_check'
  ) then
    alter table bots
      add constraint bots_strategy_type_check
      check (strategy_type in ('grid', 'dca', 'momentum', 'qqe', 'vwap', 'copy'));
  end if;
end $$;
