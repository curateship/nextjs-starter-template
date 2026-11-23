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

-- The old column is LEFT IN PLACE on purpose. The release running right now
-- still reads it, and Coolify keeps that container serving while the new one
-- starts — so dropping it here would break the site for the minute the two
-- overlap. Removing it is a later release, once nothing reads it. See
-- "Why that order matters" in docs/deployment.md.
