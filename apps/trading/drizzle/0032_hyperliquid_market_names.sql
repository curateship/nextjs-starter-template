alter table trading_notifications
  alter column coin type varchar(64);

alter table chart_trendlines
  alter column market type varchar(64);

alter table bot_state
  alter column market type varchar(64);

alter table bot_orders
  alter column market type varchar(64);

alter table bot_trades
  alter column market type varchar(64);

alter table audit_log
  alter column market type varchar(64);

alter table paper_positions
  alter column coin type varchar(64);

alter table paper_orders
  alter column coin type varchar(64);

alter table paper_fills
  alter column coin type varchar(64);
