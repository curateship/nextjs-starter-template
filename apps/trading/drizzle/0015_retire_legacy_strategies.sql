-- Strategy-system rebuild, phase D: the six legacy strategies (grid, dca,
-- momentum, qqe, vwap, copy) are retired. Their bots are archived — stopped,
-- clearly labeled, forever readable — and nothing is deleted. Only the new
-- model ("signal") runs from here on. Idempotent: re-runs on every startup.

update bots
  set desired_state = 'stopped',
      status = 'stopped',
      status_reason = 'Legacy strategy retired by the strategy-system rebuild'
  where strategy_type <> 'signal'
    and status <> 'stopped';

update bot_state
  set status = 'stopped'
  where bot_id in (select id from bots where strategy_type <> 'signal')
    and status is distinct from 'stopped';
