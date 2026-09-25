-- EVM transaction hashes are 66 characters. Keep room for Solana signatures too.
ALTER TABLE trade_live_fills ALTER COLUMN fill_id TYPE varchar(128), ALTER COLUMN order_id TYPE varchar(128);
ALTER TABLE trade_live_triggers ALTER COLUMN order_id TYPE varchar(128);
ALTER TABLE trade_grid_order_rungs ALTER COLUMN order_id TYPE varchar(128);
ALTER TABLE trade_flow_run_orders ALTER COLUMN order_id TYPE varchar(128);
ALTER TABLE trade_paper_journal ALTER COLUMN order_id TYPE varchar(128);

-- A signed hash is saved before broadcast, so an uncertain send survives a restart.
CREATE TABLE trade_bnb_transactions (
  hash varchar(66) PRIMARY KEY,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id varchar(36) NOT NULL,
  address varchar(42) NOT NULL,
  market_id varchar(42) NOT NULL,
  kind varchar(8) NOT NULL CHECK (kind IN ('approval', 'swap')),
  state varchar(10) NOT NULL CHECK (state IN ('pending', 'confirmed', 'failed')),
  note text,
  approvals jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trade_bnb_transactions_wallet_idx ON trade_bnb_transactions(user_id, wallet_id, state);
CREATE INDEX trade_bnb_transactions_address_idx ON trade_bnb_transactions(address, state);
