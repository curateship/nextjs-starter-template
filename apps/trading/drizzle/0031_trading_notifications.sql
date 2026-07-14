create table trading_notifications (
  id varchar(36) primary key,
  user_id varchar(36) not null references users(id) on delete cascade,
  wallet_id varchar(36) not null references wallets(id) on delete cascade,
  event_key varchar(200) not null,
  kind varchar(30) not null,
  coin varchar(20) not null,
  side varchar(5) not null,
  price numeric not null,
  size numeric not null,
  occurred_at timestamp with time zone not null,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null,
  constraint trading_notifications_kind_check
    check (kind in ('position_opened', 'take_profit', 'stop_loss')),
  constraint trading_notifications_side_check check (side in ('long', 'short')),
  constraint trading_notifications_user_event_unique unique (user_id, event_key)
);

create index ix_trading_notifications_user_occurred
  on trading_notifications (user_id, occurred_at desc, id desc);
create index ix_trading_notifications_user_unread
  on trading_notifications (user_id, read_at);

create table trading_notification_cursors (
  wallet_id varchar(36) primary key references wallets(id) on delete cascade,
  last_synced_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);
