-- Trade's own migrations number from 0100 — see 0100_trade_market_favorites.
--
-- How far the chart is zoomed in and how far back it is scrolled, remembered
-- against the account so it is the same on every market and after a reload.
-- One jsonb column rather than two numeric ones: what makes up a view may grow
-- and this is a remembered convenience, not a record anything is looked up by.
ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "chart_view" jsonb;
