-- Trade journal: our own permanent copy of every real-money fill. Hyperliquid
-- serves roughly 365 days and caps a response near 2,000 fills, so hand-placed
-- trades — which are persisted nowhere else — quietly expire. Bot fills are
-- ordinary wallet fills too, so this is the one feed; `bot_id` tags the rows a
-- bot placed (matched on hl_tid) instead of duplicating them.
--
-- Only mainnet wallets are ever synced here. Testnet and practice money is
-- excluded at the source, not filtered in the UI.
create table wallet_fills (
  id varchar(36) primary key,
  wallet_id varchar(36) not null references wallets(id) on delete cascade,
  bot_id varchar(36) references bots(id) on delete set null,
  hl_tid bigint not null,
  market varchar(64) not null,
  side varchar(4) not null,
  dir varchar(64),
  px numeric not null,
  sz numeric not null,
  fee numeric not null default '0',
  closed_pnl numeric not null default '0',
  oid bigint,
  cloid varchar(66),
  fill_time timestamptz not null,
  created_at timestamptz not null,
  constraint wallet_fills_side_check check (side in ('buy', 'sell'))
);

-- A re-sync overlaps the window it already has; this makes re-inserting a fill
-- a no-op instead of double-counting it.
create unique index ux_wallet_fills_wallet_id_hl_tid on wallet_fills (wallet_id, hl_tid);
create index ix_wallet_fills_wallet_id_fill_time on wallet_fills (wallet_id, fill_time);
