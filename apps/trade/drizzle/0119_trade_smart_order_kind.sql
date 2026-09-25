-- Trade's own migrations number from 0100 — see 0100_trade_market_favorites.
--
-- A second kind of smart order: the grid. It shares this table with the DCA
-- ladder rather than getting one of its own, and the reason is not tidiness.
--
-- There is exactly ONE position per coin per wallet, and both kinds write its
-- stop. Two of them on the same coin would fight over it. Sharing the table
-- means the existing "one live smart order per coin per wallet" check blocks
-- that on its own, the worker's "which wallets have work" query picks grids up
-- unchanged, and the live path's one-exchange-read-per-wallet loop covers them
-- with no extra calls.
--
-- The plan column now holds either shape. It is read only through
-- `readSmartPlan(kind, value)` — never a bare parse — so a row whose shape this
-- build does not recognise is ignored rather than half-obeyed.
ALTER TABLE "trade_smart_ladders"
  ADD COLUMN IF NOT EXISTS "kind" varchar(8) NOT NULL DEFAULT 'dca';

-- Every row that existed before this migration is a DCA ladder, which is what
-- the default says. Nothing has to be back-filled.

-- The worker asks "which wallets have a smart order working?" once a second,
-- across every user. Without this it is a scan of the whole table each time,
-- and finished ladders stay for the record so the table only ever grows.
CREATE INDEX IF NOT EXISTS "trade_smart_ladders_active_idx"
  ON "trade_smart_ladders" ("status")
  WHERE "status" = 'active';

-- The grid window's last-used settings, remembered per person — a sibling of
-- "smart_dca" and deliberately not folded into it, because the two windows ask
-- for different things and each column is validated by its own schema.
ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "smart_grid" jsonb;
