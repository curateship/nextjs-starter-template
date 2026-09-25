-- True cost report: our own permanent copy of every funding payment. Funding
-- is the small hourly payment perpetual positions pay or receive; Hyperliquid
-- serves a limited window of it (responses cap at 500 entries) and it is
-- stored nowhere else, so without this it is silently missing from every
-- profit number.
--
-- Sign convention, verified against live payments: `usdc` is the signed
-- amount credited to the wallet — positive means the wallet received funding,
-- negative means it paid.
create table wallet_funding (
  id varchar(36) primary key,
  wallet_id varchar(36) not null references wallets(id) on delete cascade,
  market varchar(64) not null,
  usdc numeric not null,
  szi numeric,
  funding_rate numeric,
  funding_time timestamptz not null,
  created_at timestamptz not null
);

-- One row per wallet, market, and funding tick. The exchange's transaction
-- hash is all zeros for funding, so this trio is the identity; a re-sync
-- overlapping a window it already holds re-inserts rows as a no-op instead of
-- double-counting them.
create unique index ux_wallet_funding_wallet_market_time on wallet_funding (wallet_id, market, funding_time);
create index ix_wallet_funding_wallet_id_funding_time on wallet_funding (wallet_id, funding_time);
