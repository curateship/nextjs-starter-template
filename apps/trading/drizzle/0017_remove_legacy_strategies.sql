-- Hard-cut removal of the retired legacy strategy system. The indicator-based
-- model ("signal") is the only one: legacy backtest runs and archived legacy
-- bots are deleted (bot children cascade), the bots check tightens to signal
-- only, and the orphaned legacy tables (already absent from schema.ts) drop.
--
-- IMPORTANT (July 12, 2026 fix): every migration re-runs on each db:setup, so
-- the deletes must name the legacy types explicitly. The original
-- `<> 'signal'` form re-deleted every AUTOMATION bot and backtest run created
-- after this migration first shipped — data written by later eras must never
-- match an old cleanup's filter. The constraint write is guarded the same way
-- (0020/0024 own the current definition).

delete from backtests
where strategy_type in ('grid', 'dca', 'momentum', 'qqe', 'vwap', 'copy');

delete from bots
where strategy_type in ('grid', 'dca', 'momentum', 'qqe', 'vwap', 'copy');

-- 'automation' is included so re-runs never fail against rows created by the
-- later automation era; 0024 owns the final ('automation'-only) definition.
alter table bots drop constraint if exists bots_strategy_type_check;
alter table bots
  add constraint bots_strategy_type_check
  check (strategy_type in ('signal', 'automation'));

drop table if exists strategy_templates;
drop table if exists strategy_defaults;
