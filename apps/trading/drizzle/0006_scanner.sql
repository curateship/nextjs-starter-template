create table if not exists scanner_trades (
  id varchar(36) primary key,
  tid bigint not null,
  ts timestamp with time zone not null,
  coin varchar(20) not null,
  side varchar(4) not null,
  px numeric not null,
  sz numeric not null,
  notional numeric not null,
  buyer varchar(42) not null,
  seller varchar(42) not null,
  constraint scanner_trades_side_check check (side in ('buy', 'sell'))
);

create unique index if not exists ux_scanner_trades_tid on scanner_trades (tid);
create index if not exists ix_scanner_trades_ts on scanner_trades (ts);
create index if not exists ix_scanner_trades_coin_ts on scanner_trades (coin, ts);
create index if not exists ix_scanner_trades_buyer_ts on scanner_trades (buyer, ts);
create index if not exists ix_scanner_trades_seller_ts on scanner_trades (seller, ts);

create table if not exists scanner_wallets (
  address varchar(42) primary key,
  label varchar(255),
  tracked boolean not null default false,
  ignored boolean not null default false,
  auto_labels jsonb not null default '[]',
  quality_score integer,
  first_seen_at timestamp with time zone not null,
  last_seen_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create index if not exists ix_scanner_wallets_last_seen_at on scanner_wallets (last_seen_at);
create index if not exists ix_scanner_wallets_tracked on scanner_wallets (tracked);

create table if not exists scanner_wallet_stats (
  address varchar(42) primary key references scanner_wallets(address) on delete cascade,
  account_value numeric,
  pnl_7d numeric,
  pnl_30d numeric,
  win_rate numeric,
  fill_count_30d integer,
  avg_trade_notional numeric,
  largest_win numeric,
  largest_loss numeric,
  top_coins jsonb,
  open_positions jsonb,
  avg_hold_minutes numeric,
  portfolio_history jsonb,
  stats_updated_at timestamp with time zone not null
);

create table if not exists scanner_wallet_daily (
  address varchar(42) not null,
  day date not null,
  trade_count integer not null default 0,
  notional numeric not null default 0,
  buy_notional numeric not null default 0,
  sell_notional numeric not null default 0,
  constraint scanner_wallet_daily_pkey primary key (address, day)
);

create table if not exists scanner_positions (
  address varchar(42) not null,
  coin varchar(20) not null,
  szi numeric not null,
  entry_px numeric,
  notional numeric not null,
  leverage numeric,
  unrealized_pnl numeric,
  updated_at timestamp with time zone not null,
  constraint scanner_positions_pkey primary key (address, coin)
);

create table if not exists scanner_position_events (
  id varchar(36) primary key,
  address varchar(42) not null,
  coin varchar(20) not null,
  event_type varchar(20) not null,
  prev_szi numeric,
  new_szi numeric,
  prev_notional numeric,
  new_notional numeric,
  ts timestamp with time zone not null,
  constraint scanner_position_events_type_check check (event_type in ('opened', 'closed', 'increased', 'reduced', 'flipped', 'reopened'))
);

create index if not exists ix_scanner_position_events_ts on scanner_position_events (ts);
create index if not exists ix_scanner_position_events_address_ts on scanner_position_events (address, ts);
create index if not exists ix_scanner_position_events_coin_ts on scanner_position_events (coin, ts);

create table if not exists scanner_alerts (
  id varchar(36) primary key,
  type varchar(40) not null,
  coin varchar(20),
  address varchar(42),
  title text not null,
  body text,
  data jsonb,
  dedupe_key varchar(160),
  created_at timestamp with time zone not null,
  read_at timestamp with time zone
);

create unique index if not exists ux_scanner_alerts_dedupe_key on scanner_alerts (dedupe_key) where dedupe_key is not null;
create index if not exists ix_scanner_alerts_created_at on scanner_alerts (created_at);
create index if not exists ix_scanner_alerts_read_at on scanner_alerts (read_at);

create table if not exists scanner_crowd_signals (
  id varchar(36) primary key,
  coin varchar(20) not null,
  direction varchar(5) not null,
  score numeric not null,
  wallet_count integer not null,
  notional numeric not null,
  avg_quality numeric,
  window_start timestamp with time zone not null,
  window_end timestamp with time zone not null,
  data jsonb,
  created_at timestamp with time zone not null,
  constraint scanner_crowd_signals_direction_check check (direction in ('long', 'short'))
);

create index if not exists ix_scanner_crowd_signals_created_at on scanner_crowd_signals (created_at);
create index if not exists ix_scanner_crowd_signals_coin_created_at on scanner_crowd_signals (coin, created_at);

create table if not exists scanner_book_metrics (
  coin varchar(20) primary key,
  mid numeric,
  spread_bps numeric,
  bid_liquidity jsonb,
  ask_liquidity jsonb,
  imbalance numeric,
  walls jsonb,
  updated_at timestamp with time zone not null
);

-- The one-time backfill that appended the Research nav section here was
-- removed: setup-database.mjs replays every migration on each start, so the
-- "add if missing" guard kept resurrecting the section after users deleted
-- it from their sidebar. New workspaces get the section from
-- createDefaultWorkspaceSections; existing ones own their nav.
