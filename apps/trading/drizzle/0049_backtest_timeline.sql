-- Replay tape for the backtest chart: the order/protection/strategy deltas
-- the engine records each bar (pending limit ladder, SL/TP levels, strategy
-- events). Its own column so the replay chart can load it lazily — the
-- always-loaded result blob stays the size it was.
alter table backtests add column timeline jsonb;
