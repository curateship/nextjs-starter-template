CREATE TABLE trade_market_first_seen (
  market_key text PRIMARY KEY,
  first_seen_at timestamptz NOT NULL DEFAULT now()
);
