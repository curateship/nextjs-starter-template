ALTER TABLE "trade_wallets"
  ADD COLUMN IF NOT EXISTS "status" varchar(8) NOT NULL DEFAULT 'active';

ALTER TABLE "trade_wallets"
  DROP CONSTRAINT IF EXISTS "trade_wallets_status_check";

ALTER TABLE "trade_wallets"
  ADD CONSTRAINT "trade_wallets_status_check"
  CHECK ("status" IN ('active', 'inactive'));
