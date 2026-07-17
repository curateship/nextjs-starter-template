-- Liquidation-risk monitor: the snapshot poller writes a 'liquidation_risk'
-- trading notification when a position's distance to liquidation drops
-- inside the saved threshold.
alter table trading_notifications
  drop constraint trading_notifications_kind_check;
alter table trading_notifications
  add constraint trading_notifications_kind_check check (
    kind in ('position_opened', 'take_profit', 'stop_loss', 'liquidation_risk')
  );
