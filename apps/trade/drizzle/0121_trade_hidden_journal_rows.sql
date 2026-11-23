-- Trade's own migrations number from 0100 — see 0100_trade_market_favorites.
--
-- The bin on a row in Fill history and in the Journal.
--
-- **Hidden, not deleted, and that is not timidity.** A practice wallet's cash
-- IS the sum of its fills — `realizedTotal` in `src/server/trade/paper.ts` adds
-- up `closed_pnl - fee` across this very table every time the account panel
-- polls. Really deleting a row would move the balance: bin a losing fill and
-- the wallet invents the money back. Nobody pressing a bin on a list means
-- "and change what I am worth".
--
-- The real fills have their own reason: a deleted `trade_live_fills` row would
-- simply come back, because the sweep asks the exchange for everything since
-- the newest fill it has — so removing the newest ones lowers that mark and the
-- next pass writes them again.
--
-- So the row stays and stops being shown. Money, history and the sweep are all
-- left exactly as they were.
ALTER TABLE "trade_paper_journal"
  ADD COLUMN IF NOT EXISTS "hidden" boolean NOT NULL DEFAULT false;

ALTER TABLE "trade_live_fills"
  ADD COLUMN IF NOT EXISTS "hidden" boolean NOT NULL DEFAULT false;
