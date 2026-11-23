ALTER TABLE "trade_wallets"
  ADD COLUMN "aster_margin_mode" varchar(8) NOT NULL DEFAULT 'isolated'
  CONSTRAINT "ck_trade_wallets_aster_margin_mode"
  CHECK ("aster_margin_mode" IN ('isolated', 'cross'));
