create table if not exists paper_wallets (
  id varchar(36) primary key,
  user_id varchar(36) not null references users(id) on delete cascade,
  label varchar(255) not null,
  starting_equity numeric not null,
  cash numeric not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null
);

create index if not exists ix_paper_wallets_user_id on paper_wallets (user_id);

create table if not exists paper_positions (
  paper_wallet_id varchar(36) not null references paper_wallets(id) on delete cascade,
  coin varchar(20) not null,
  szi numeric not null,
  entry_px numeric not null,
  updated_at timestamp with time zone not null,
  constraint paper_positions_pkey primary key (paper_wallet_id, coin)
);

create table if not exists paper_orders (
  id varchar(36) primary key,
  paper_wallet_id varchar(36) not null references paper_wallets(id) on delete cascade,
  coin varchar(20) not null,
  side varchar(4) not null,
  order_type varchar(10) not null,
  px numeric,
  sz numeric not null,
  remaining_sz numeric not null,
  tif varchar(3) not null,
  reduce_only boolean not null default false,
  status varchar(20) not null default 'pending',
  reason text,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  constraint paper_orders_side_check check (side in ('buy', 'sell')),
  constraint paper_orders_order_type_check check (order_type in ('market', 'limit')),
  constraint paper_orders_tif_check check (tif in ('Gtc', 'Ioc', 'Alo')),
  constraint paper_orders_status_check check (status in ('pending', 'resting', 'filled', 'cancelled', 'cancelling', 'rejected'))
);

create index if not exists ix_paper_orders_wallet_status on paper_orders (paper_wallet_id, status);

create table if not exists paper_fills (
  id varchar(36) primary key,
  paper_wallet_id varchar(36) not null references paper_wallets(id) on delete cascade,
  coin varchar(20) not null,
  side varchar(4) not null,
  px numeric not null,
  sz numeric not null,
  fee numeric not null,
  closed_pnl numeric not null,
  fill_time timestamp with time zone not null,
  created_at timestamp with time zone not null,
  constraint paper_fills_side_check check (side in ('buy', 'sell'))
);

create index if not exists ix_paper_fills_wallet_fill_time on paper_fills (paper_wallet_id, fill_time);
