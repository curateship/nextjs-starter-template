-- Which order a practice fill came from.
--
-- The practice engine has always known this — it hands the order id to the
-- fill and the replay uses it to label an arrow with the rung that bought it —
-- and then dropped it on the way into the database, because until now nothing
-- read it back. With a run's dashboard to draw, that id is the whole link
-- between a practice trade and the flow that placed it, and the alternative
-- was a second, practice-only way of answering a question `trade_flow_run_orders`
-- already answers for real money.
--
-- Null on a fill nothing placed: a stop, a liquidation, a hand-closed position.
ALTER TABLE "trade_paper_journal"
  ADD COLUMN IF NOT EXISTS "order_id" varchar(40);
