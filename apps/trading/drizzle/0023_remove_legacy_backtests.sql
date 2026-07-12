-- Backtesting is now launched only from Automations, and the DCA strategy
-- kind was removed from the code. Old saved runs from the template era
-- reference retired code paths and the user chose not to keep them.
-- The retired types are named EXPLICITLY (never `<> 'automation'`) so this
-- re-running cleanup can never delete rows a future era creates.
delete from backtests
where strategy_type in
  ('signal', 'dca', 'qfl', 'grid', 'momentum', 'qqe', 'vwap', 'copy');
