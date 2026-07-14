create table if not exists market_scanner_rules (
  id varchar(36) primary key,
  user_id varchar(36) not null references users(id) on delete cascade,
  rule_slot integer not null,
  name varchar(100) not null,
  kind varchar(20) not null check (kind in ('price_move', 'volume_spike')),
  direction varchar(4),
  threshold numeric not null,
  market_scope varchar(10) not null check (market_scope in ('all', 'selected')),
  markets jsonb not null,
  time_window varchar(4) not null check (time_window in ('1m', '5m', '15m', '1h', '4h', '24h')),
  cooldown varchar(4) not null check (cooldown in ('5m', '15m', '1h', '4h', '24h')),
  enabled boolean not null default true,
  last_evaluated_at timestamptz,
  last_triggered_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint market_scanner_rules_slot_check check (rule_slot between 1 and 100),
  constraint market_scanner_rules_user_slot_unique unique (user_id, rule_slot),
  constraint market_scanner_rules_direction_check check (
    (kind = 'price_move' and direction in ('up', 'down')) or
    (kind = 'volume_spike' and direction is null)
  )
);

create index if not exists ix_market_scanner_rules_user_updated
  on market_scanner_rules (user_id, updated_at desc);
create index if not exists ix_market_scanner_rules_enabled
  on market_scanner_rules (enabled);

create table if not exists market_scanner_alerts (
  id varchar(36) primary key,
  user_id varchar(36) not null references users(id) on delete cascade,
  rule_id varchar(36) references market_scanner_rules(id) on delete set null,
  event_key varchar(200) not null,
  rule_name varchar(100) not null,
  kind varchar(20) not null,
  direction varchar(4),
  coin varchar(64) not null,
  time_window varchar(4) not null,
  threshold numeric not null,
  observed numeric not null,
  title text not null,
  body text,
  data jsonb,
  occurred_at timestamptz not null,
  read_at timestamptz,
  created_at timestamptz not null,
  constraint market_scanner_alerts_user_event_unique unique (user_id, event_key)
);

create index if not exists ix_market_scanner_alerts_user_occurred
  on market_scanner_alerts (user_id, occurred_at desc, id desc);
create index if not exists ix_market_scanner_alerts_user_unread
  on market_scanner_alerts (user_id, read_at);
