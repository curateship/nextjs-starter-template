-- The Signals step: a flow can now trade on what the indicators say.
--
-- Two changes, and the second one matters more than it looks.

-- 1. Which arrow each coin was last acted on.
--
-- An arrow stays the newest one for as long as its candle is the last to have
-- confirmed anything, which on a four-hour chart is hours. Without this the
-- pass would buy the same coin again every time it came round.
ALTER TABLE "trade_flow_runs"
  ADD COLUMN IF NOT EXISTS "acted" jsonb DEFAULT '{}'::jsonb NOT NULL;

-- 2. Every flow already running gets its strategy named.
--
-- The frozen spec used to hold `params` and `interval` at its top level,
-- because there was only one strategy and it did not need saying. Now it holds
-- a `strategy` that says which of the two it is.
--
-- Rewritten here rather than read both ways in code, on purpose: a flow with
-- real money on it must not depend on the app remembering to understand an old
-- shape, and two shapes in the reader is two shapes forever. After this runs
-- there is one.
UPDATE "trade_flow_runs"
SET "spec" = ("spec" - 'params' - 'interval') || jsonb_build_object(
      'strategy', jsonb_build_object(
        'kind', 'dca',
        'params', "spec" -> 'params',
        'interval', "spec" -> 'interval'
      )
    )
WHERE "spec" ? 'params'
  AND "spec" ? 'interval'
  AND NOT ("spec" ? 'strategy');

-- 3. Every backtest already recorded gets its strategy named, the same way.
--
-- These are historical records and their numbers do not change — only the
-- shape of the description of what they tested. Rewritten rather than read two
-- ways for the same reason as above: a result that could be read two ways is a
-- result nobody can be sure about.
UPDATE "trade_backtest_groups"
SET "spec" = ("spec" - 'params') || jsonb_build_object(
      'strategy', jsonb_build_object('kind', 'dca', 'params', "spec" -> 'params')
    )
WHERE "spec" ? 'params'
  AND NOT ("spec" ? 'strategy');
