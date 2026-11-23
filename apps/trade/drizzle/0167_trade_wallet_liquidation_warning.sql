ALTER TABLE trade_wallets
  ADD COLUMN liquidation_warn_usd double precision,
  ADD COLUMN liquidation_warn_pct double precision,
  ADD CONSTRAINT trade_wallets_liquidation_warn_usd_check
    CHECK (liquidation_warn_usd > 0 AND liquidation_warn_usd <= 1000000000),
  ADD CONSTRAINT trade_wallets_liquidation_warn_pct_check
    CHECK (liquidation_warn_pct > 0 AND liquidation_warn_pct <= 100);
