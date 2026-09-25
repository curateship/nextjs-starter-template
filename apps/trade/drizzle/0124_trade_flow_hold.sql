-- When a flow stops trying, because the same thing keeps refusing it.
--
-- A refusal that is about the setup rather than about one coin — the rungs come
-- out too small, there is no free cash, the key was refused — will refuse every
-- coin on the list in exactly the same way. Trying the next one is guaranteed
-- to fail, so a flow with a hundred coins spent all day asking the exchange a
-- question it had already answered.
--
--   { "code": "SMART_RUNG_TOO_SMALL", "strikes": 3, "until": 1755… }
--
-- Three of the same in a row and it waits, doubling the wait each time it comes
-- back to the same answer. Coming back is one coin, never the whole list, so
-- being wrong about it costs a single call.
ALTER TABLE "trade_flow_runs"
  ADD COLUMN IF NOT EXISTS "hold" jsonb;
