-- One remembered wallet per exchange, instead of one for the whole app.
--
-- A dashboard only lists its own exchange's wallets. With a single memory
-- holding one wallet, opening any other exchange's dashboard matched nothing
-- and asked which wallet to trade with — and answering overwrote the memory,
-- so the next dashboard asked in turn. Every dashboard asked, every load.
--
-- The old value is kept, filed under the exchange whose wallet it names, so
-- the dashboard somebody was last using does not ask again.
ALTER TABLE "trade_prefs"
  ADD COLUMN IF NOT EXISTS "last_wallet_ids" jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE "trade_prefs" p
SET "last_wallet_ids" = jsonb_build_object(w."protocol", p."last_wallet_id")
FROM "trade_wallets" w
WHERE w."id" = p."last_wallet_id"
  AND p."last_wallet_id" IS NOT NULL
  AND p."last_wallet_ids" = '{}'::jsonb;

ALTER TABLE "trade_prefs" DROP COLUMN IF EXISTS "last_wallet_id";
