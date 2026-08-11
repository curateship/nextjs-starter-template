-- Earlier builds stored Binance candles under every market key, including
-- keys that named Hyperliquid. These tables are a rebuildable cache, so clear
-- them once before the store begins following the protocol in each key.
TRUNCATE TABLE
  "trade_candle_gaps",
  "trade_candle_coverage",
  "trade_candles";
