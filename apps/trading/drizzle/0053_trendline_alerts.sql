-- Alerts on hand-drawn trendlines: a new 'trendline' alert kind whose rule
-- points at a saved chart drawing instead of a fixed price. The worker
-- recomputes the line's price every evaluation, so sloped lines trigger at
-- the line's price now, not where it was drawn.

alter table alert_rules
  add column network varchar(10),
  add column trendline_id varchar(80),
  add column touch varchar(5);

alter table alert_rules
  drop constraint if exists alert_rules_kind_check;

alter table alert_rules
  add constraint alert_rules_kind_check check (
    kind in ('price_level', 'price_move', 'volume_spike', 'trendline')
  );

alter table alert_rules
  drop constraint if exists alert_rules_condition_check;

alter table alert_rules
  add constraint alert_rules_condition_check check (
    (
      kind = 'price_level'
      and operator in ('crossing', 'crossing_up', 'crossing_down')
      and level > 0
      and direction is null
      and percent is null
      and multiplier is null
      and time_window is null
      and network is null
      and trendline_id is null
      and touch is null
    )
    or (
      kind = 'price_move'
      and operator is null
      and level is null
      and direction in ('up', 'down')
      and percent > 0
      and percent <= 100
      and multiplier is null
      and time_window in ('1m', '5m', '15m', '1h', '4h', '24h')
      and network is null
      and trendline_id is null
      and touch is null
    )
    or (
      kind = 'volume_spike'
      and operator is null
      and level is null
      and direction is null
      and percent is null
      and multiplier > 1
      and multiplier <= 100
      and time_window in ('1m', '5m', '15m', '1h', '4h', '24h')
      and network is null
      and trendline_id is null
      and touch is null
    )
    or (
      kind = 'trendline'
      and operator is null
      and level is null
      and direction is null
      and percent is null
      and multiplier is null
      and time_window is null
      and network in ('testnet', 'mainnet')
      and trendline_id is not null
      and touch in ('wick', 'close')
    )
  );

-- One rule per drawn line: the chart's on/off toggle relies on it, and the
-- friendly duplicate check in the app is not race-proof on its own.
create unique index ux_alert_rules_trendline
  on alert_rules (user_id, network, coin, trendline_id)
  where kind = 'trendline';

alter table alert_events
  add column touch varchar(5);

alter table alert_events
  drop constraint if exists alert_events_kind_check;

alter table alert_events
  add constraint alert_events_kind_check check (
    kind in ('price_level', 'price_move', 'volume_spike', 'trendline')
  );

alter table alert_events
  drop constraint if exists alert_events_condition_check;

-- Trendline events keep the line's price at the moment of the touch in
-- `level`, so the log shows where the moving trigger actually was.
alter table alert_events
  add constraint alert_events_condition_check check (
    (
      kind = 'price_level'
      and operator in ('crossing', 'crossing_up', 'crossing_down')
      and level > 0
      and direction is null
      and percent is null
      and multiplier is null
      and time_window is null
      and touch is null
    )
    or (
      kind = 'price_move'
      and operator is null
      and level is null
      and direction in ('up', 'down')
      and percent > 0
      and percent <= 100
      and multiplier is null
      and time_window in ('1m', '5m', '15m', '1h', '4h', '24h')
      and touch is null
    )
    or (
      kind = 'volume_spike'
      and operator is null
      and level is null
      and direction is null
      and percent is null
      and multiplier > 1
      and multiplier <= 100
      and time_window in ('1m', '5m', '15m', '1h', '4h', '24h')
      and touch is null
    )
    or (
      kind = 'trendline'
      and operator is null
      and level > 0
      and direction is null
      and percent is null
      and multiplier is null
      and time_window is null
      and touch in ('wick', 'close')
    )
  );
