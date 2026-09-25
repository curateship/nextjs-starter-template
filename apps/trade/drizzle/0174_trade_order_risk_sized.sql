-- Whether an order was sized by risking a share of the wallet.
--
-- Dragging a stop resizes only those orders, because the stop is what worked
-- their amount out in the first place. An order sized in dollars keeps its
-- dollars however far its stop is dragged. Existing orders default to false,
-- which leaves their amount alone.
ALTER TABLE "trade_paper_orders" ADD COLUMN IF NOT EXISTS "risk_sized" boolean NOT NULL DEFAULT false;
