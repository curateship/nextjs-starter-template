-- The dashboard reads a wallet's newest fills every few seconds, ordered by
-- time. The only index had market_key between wallet_id and at, so that read
-- sorted the wallet's whole history on every poll.
CREATE INDEX "trade_live_fills_time_idx"
ON "trade_live_fills" ("user_id", "wallet_id", "at");
