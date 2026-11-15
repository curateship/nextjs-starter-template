-- "Hide empty blocks" on the Trade dashboard's page (Tyler, 8 Nov 2026: "why
-- is the block with no trades on it not hiding?", then picking one switch in
-- the page's ⋮). On, the Manual trades, Grid trades and DCA trades blocks
-- leave the page while they have nothing to show on the exchange picked, and
-- come back when they do. Saved per account; off until switched on. An
-- addition only.
ALTER TABLE "trade_prefs" ADD COLUMN IF NOT EXISTS "hide_empty_blocks" boolean NOT NULL DEFAULT false;
