# DCA step-down entry — and its open risks

Plain English on purpose. This covers the "Only buy after 2 green candles"
step-down entry for the DCA ladder, plus the backtest and dashboard changes that
shipped alongside it, and — most importantly — the things that are **not** fully
proven yet. Read the caveats before trusting this with real money.

## What shipped

Four related changes went in together:

1. **DCA step-down entry ("Only buy after 2 green candles").** Instead of buying a
   rung the instant price crosses its level, a rung buys only once price sits its
   full step below the reference (the base for the first rung, the last fill for
   the rest) *and* two green candles have confirmed the bounce, on a candle that
   both opens and closes below that level. One drop fills at most one rung. If the
   base runs away upward to a new shelf, the ladder re-anchors up to it instead of
   sitting on a stale low base.
2. **Per-rung sizing and exit options.** Compound vs fixed bet sizing,
   market vs limit rung entry, a stop measured from the first entry instead of the
   moving average, and a "sell everything at the nearest rung" exit.
3. **Combined-basket backtest summary.** The editor's backtest panel now folds
   every finished market into one headline (summed P&L, trade-weighted win rate,
   basket drawdown), measuring the return against the capital *actually* deployed.
4. **Dashboard shared-wallet fix.** The run-group dashboard used to divide a shared
   basket's profit by the summed starting capital, which made the return read
   roughly N times too small (the "$510k deployed" bug). It now uses the one shared
   wallet as the denominator.

## Caveats and open risks

### Not verified in a live or running context
- **The live-trading path was never run on a real or testnet bot.** The safety
  guard that stops a live bot from re-firing the same rung while a fill settles was
  checked by reasoning and in backtests (where it is byte-identical), but the real
  broker path — fills returning a moment after the order is sent — has not been
  exercised. It assumes the broker's "order placed" callback fires the instant a
  market order is sent; if it doesn't, the guard could still have a gap.
- **No browser check of the UI.** The combined-basket panel, the chart timeframe
  zoom, and the corrected dashboard percentage look right in code and unit tests,
  but none have been opened in a real browser. Per the repo rule, do a browser pass
  before calling them done.

### The strategy itself (substance, not code)
- On honest testing — random markets, no survivorship bias — the DCA/step-down
  strategy is still a **net loser**. The two-green filter is insurance that softens
  crash losses; it does not make the strategy profitable. The code works as
  intended, but whether the idea makes money is a separate, unresolved question.
  Follow `../backtesting-guide.md` before drawing any conclusion from a result.

### Residual gaps in the fixes
- **The wedge fix has no dedicated regression test, and one edge case remains.** The
  upward re-anchor handles the normal case (price climbs to a new shelf that forms
  a base). A pure, pullback-free grind upward that never forms a new base could
  still leave a ladder idle — rare, and no money is at risk because nothing has
  filled, but it is a gap. The fix is otherwise covered by the existing step-down
  tests and mirrors the already-tested market-mode re-anchor.
- **The respect-quality filter still scans on idle bars.** The expensive
  market-history scan no longer runs while a position is held (the dominant cost),
  but it still runs each bar in the gap between cycles. Fully removing it needs a
  cached/incremental score. It only matters when that filter is turned on, which is
  off by default.
- **Two fixes shift backtest numbers for specific setups.** The flash-crash
  threshold now uses each rung's own step (changes results only for ladders with
  *uneven* rung spacing), and the flip-trade fee fix changes results only for
  strategies that reverse position. Uniform ladders and long-only DCA are
  unaffected, but saved results using those setups would move slightly if re-run.
- **"Shared wallet" is detected by looking for a QFL or DCA node.** If a future
  shared-wallet strategy type is added that is neither, the combined percentage
  would mis-count it as independent (N separate accounts).

### Pre-existing, unrelated
- The branch already carried **17 typecheck errors** (router types, a
  library-version setting, a test database harness) and **one failing test**
  (`dashboard-table`). None are touched by this work, but they are still there.

## Before this goes live
- Run the live path on a testnet bot and confirm a rung fills exactly once.
- Do a browser pass on the backtest panel, the chart timeframe zoom, and the
  dashboard percentage.
- Judge the strategy at 1× on a survivorship-free basket per the back-testing
  guide before committing capital.
