-- Robinhood Chain's signed transactions. A hash is saved before broadcast, so
-- an uncertain send survives a restart and is never sent twice.
CREATE TABLE trade_robinhood_transactions (
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
CREATE INDEX trade_robinhood_transactions_wallet_idx ON trade_robinhood_transactions(user_id, wallet_id, state);
CREATE INDEX trade_robinhood_transactions_address_idx ON trade_robinhood_transactions(address, state);
