-- The right-click order window remembers how you size a trade.
--
-- Same shape as the DCA and grid windows beside it: one column, one schema,
-- written only when an order was really placed. Null for anybody who has not
-- placed one yet, which reads as the plain defaults.
ALTER TABLE "trade_prefs"
  ADD COLUMN IF NOT EXISTS "quick_order" jsonb;
