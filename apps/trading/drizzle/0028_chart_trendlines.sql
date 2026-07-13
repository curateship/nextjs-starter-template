create table chart_trendlines (
  id varchar(36) primary key,
  user_id varchar(36) not null references users (id) on delete cascade,
  network varchar(10) not null check (network in ('testnet', 'mainnet')),
  market varchar(30) not null,
  trendlines jsonb not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  unique (user_id, network, market)
);

create index ix_chart_trendlines_user_id
  on chart_trendlines (user_id);
