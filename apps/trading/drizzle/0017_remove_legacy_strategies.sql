-- Hard-cut removal of the retired legacy strategy system. The indicator-based
-- model ("signal") is the only one: legacy backtest runs and archived legacy
-- bots are deleted (bot children cascade), the bots check tightens to signal
-- only, and the orphaned legacy tables (already absent from schema.ts) drop.

delete from backtests where strategy_type <> 'signal';

delete from bots where strategy_type <> 'signal';

alter table bots drop constraint if exists bots_strategy_type_check;
alter table bots
  add constraint bots_strategy_type_check
  check (strategy_type in ('signal'));

drop table if exists strategy_templates;
drop table if exists strategy_defaults;
