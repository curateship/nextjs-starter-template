create table if not exists wallets (
  id varchar(36) primary key,
  user_id varchar(36) not null references users(id) on delete cascade,
  label varchar(255) not null,
  network varchar(10) not null,
  account_address varchar(42) not null,
  agent_address varchar(42) not null,
  vault_address varchar(42),
  encrypted_private_key text not null,
  key_version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  constraint wallets_network_check check (network in ('testnet', 'mainnet')),
  constraint wallets_unique_user_agent_network unique (user_id, agent_address, network)
);

create index if not exists ix_wallets_user_id on wallets (user_id);

create table if not exists wallet_nonces (
  agent_address varchar(42) not null,
  network varchar(10) not null,
  last_nonce bigint not null,
  constraint wallet_nonces_pkey primary key (agent_address, network)
);

create table if not exists bots (
  id varchar(36) primary key,
  user_id varchar(36) not null references users(id) on delete cascade,
  name varchar(255) not null,
  strategy_type varchar(20) not null,
  wallet_id varchar(36) not null references wallets(id) on delete restrict,
  market varchar(20) not null,
  mode varchar(10) not null,
  desired_state varchar(10) not null default 'stopped',
  status varchar(10) not null default 'stopped',
  status_reason text,
  params jsonb not null,
  risk_params jsonb not null,
  cloid_prefix varchar(10) not null unique,
  paper_starting_equity numeric,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  constraint bots_strategy_type_check check (strategy_type in ('grid', 'dca', 'momentum', 'copy')),
  constraint bots_mode_check check (mode in ('paper', 'live')),
  constraint bots_desired_state_check check (desired_state in ('running', 'paused', 'stopped')),
  constraint bots_status_check check (status in ('stopped', 'starting', 'running', 'paused', 'error', 'killed'))
);

create index if not exists ix_bots_user_id on bots (user_id);
create index if not exists ix_bots_wallet_id on bots (wallet_id);

create table if not exists bot_state (
  bot_id varchar(36) primary key references bots(id) on delete cascade,
  strategy_state jsonb not null default '{}'::jsonb,
  paper_position jsonb,
  paper_cash numeric,
  daily_realized_pnl numeric not null default 0,
  daily_pnl_date date,
  consecutive_losses integer not null default 0,
  cooldown_until timestamp with time zone,
  peak_equity numeric,
  last_eval_at timestamp with time zone,
  updated_at timestamp with time zone not null
);

create table if not exists bot_orders (
  id varchar(36) primary key,
  bot_id varchar(36) not null references bots(id) on delete cascade,
  cloid varchar(66) not null unique,
  oid bigint,
  market varchar(20) not null,
  side varchar(4) not null,
  px numeric,
  sz numeric not null,
  remaining_sz numeric not null,
  order_type varchar(10) not null,
  tif varchar(3) not null,
  reduce_only boolean not null default false,
  purpose varchar(40) not null,
  status varchar(20) not null default 'pending',
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  constraint bot_orders_side_check check (side in ('buy', 'sell')),
  constraint bot_orders_order_type_check check (order_type in ('market', 'limit')),
  constraint bot_orders_tif_check check (tif in ('Gtc', 'Ioc', 'Alo')),
  constraint bot_orders_status_check check (status in ('pending', 'resting', 'partially_filled', 'filled', 'cancelled', 'rejected'))
);

create index if not exists ix_bot_orders_bot_id_status on bot_orders (bot_id, status);

create table if not exists bot_trades (
  id varchar(36) primary key,
  bot_id varchar(36) not null references bots(id) on delete cascade,
  wallet_id varchar(36) references wallets(id) on delete set null,
  mode varchar(10) not null,
  market varchar(20) not null,
  side varchar(4) not null,
  px numeric not null,
  sz numeric not null,
  notional numeric not null,
  fee numeric not null default 0,
  closed_pnl numeric,
  cloid varchar(66),
  oid bigint,
  hl_tid bigint,
  fill_time timestamp with time zone not null,
  created_at timestamp with time zone not null,
  constraint bot_trades_mode_check check (mode in ('paper', 'live')),
  constraint bot_trades_side_check check (side in ('buy', 'sell'))
);

create unique index if not exists ux_bot_trades_bot_id_hl_tid on bot_trades (bot_id, hl_tid) where hl_tid is not null;
create index if not exists ix_bot_trades_bot_id_fill_time on bot_trades (bot_id, fill_time);

create table if not exists bot_events (
  id varchar(36) primary key,
  bot_id varchar(36) not null references bots(id) on delete cascade,
  level varchar(5) not null,
  type varchar(40) not null,
  message text not null,
  data jsonb,
  created_at timestamp with time zone not null,
  constraint bot_events_level_check check (level in ('info', 'warn', 'error'))
);

create index if not exists ix_bot_events_bot_id_created_at on bot_events (bot_id, created_at);

create table if not exists bot_commands (
  id varchar(36) primary key,
  bot_id varchar(36) references bots(id) on delete cascade,
  command varchar(20) not null,
  payload jsonb,
  status varchar(20) not null default 'pending',
  error text,
  created_by_user_id varchar(36) references users(id) on delete set null,
  created_at timestamp with time zone not null,
  processed_at timestamp with time zone,
  constraint bot_commands_command_check check (command in ('start', 'stop', 'pause', 'resume', 'flatten', 'update_params', 'pause_all', 'flatten_all')),
  constraint bot_commands_status_check check (status in ('pending', 'processing', 'done', 'error'))
);

create index if not exists ix_bot_commands_status_created_at on bot_commands (status, created_at);

create table if not exists audit_log (
  id varchar(36) primary key,
  user_id varchar(36) references users(id) on delete set null,
  wallet_id varchar(36) references wallets(id) on delete set null,
  bot_id varchar(36) references bots(id) on delete set null,
  actor varchar(10) not null,
  action_type varchar(40) not null,
  network varchar(10) not null,
  market varchar(20),
  nonce bigint,
  cloid varchar(66),
  request jsonb not null,
  response jsonb,
  status varchar(20) not null,
  error_message text,
  created_at timestamp with time zone not null,
  constraint audit_log_actor_check check (actor in ('user', 'bot', 'system')),
  constraint audit_log_status_check check (status in ('ok', 'error', 'rejected_risk'))
);

create index if not exists ix_audit_log_wallet_id_created_at on audit_log (wallet_id, created_at);
create index if not exists ix_audit_log_bot_id_created_at on audit_log (bot_id, created_at);
create index if not exists ix_audit_log_created_at on audit_log (created_at);

create table if not exists account_snapshots (
  id varchar(36) primary key,
  wallet_id varchar(36) not null references wallets(id) on delete cascade,
  captured_at timestamp with time zone not null,
  equity numeric not null,
  margin_used numeric not null,
  unrealized_pnl numeric not null,
  withdrawable numeric not null,
  positions jsonb not null
);

create index if not exists ix_account_snapshots_wallet_id_captured_at on account_snapshots (wallet_id, captured_at);

create table if not exists worker_heartbeats (
  id varchar(36) primary key,
  started_at timestamp with time zone not null,
  last_seen_at timestamp with time zone not null,
  version varchar(40),
  meta jsonb
);
