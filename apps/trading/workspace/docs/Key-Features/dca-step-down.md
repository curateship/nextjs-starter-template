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

## Take-profit style: "Money back at nearest rung, then ride free" (July 25, 2026)

A fourth option in the Take Profit node's **Take profit style** dropdown, next to
*At the average price*, *Sell at previous rung* and *Sell everything at nearest
rung*. It exists to stop the walk-down bleed: a ladder that keeps buying into a
fall and then waits for a full recovery that never comes.

### The problem it solves

The other rung styles all wait for price to climb back to a level it already fell
through. *Sell at previous rung* needs the whole way back to the base before the
ladder is fully out. When a market just bleeds, none of that happens, and the
position sits there getting worse — the −8% over 60 bars that prompted this.

### What it does

Two resting sell orders instead of one.

1. **The cash-back sell** sits at the nearest rung above the deepest buy — the
   first level a bounce reclaims, the same level *Sell everything at nearest rung*
   uses. It sells only **enough to hand back every dollar the ladder spent**, not
   the whole position. After it fills, nothing is at risk.
2. **The free-ride sell** takes the coins that first sale left behind. They cost
   nothing, so they wait just under the base — **Sell below base %** on the DCA
   node, default 2 — and their sale is the trade's entire profit.

Worked example. Base $100, rungs at $95.00, $87.40 and $77.79, $1,000 spent for
12.12 coins:

| Step | What happens |
| --- | --- |
| Bounce to $87.40 | Sell 11.44 coins → the whole $1,000 comes back |
| Still held | 0.68 coins, cost basis zero |
| Those rest at $98.00 | base − 2%; when they fill that is **+$66** |

Both orders rest at the same time, and their sizes add up to exactly the position,
so one fast bar running through both levels fills both.

### Why just *under* the base, not on it

Price that has fallen through a level usually stalls short of fully reclaiming it.
Resting the runner a little below the base gets it filled on bounces that stop just
short. The same reasoning is why the cash-back sell uses the nearest rung rather
than the base: it wants the *first* level a recovery reaches, not the best one.

### Details worth knowing

- **"Money back" is gross of fees.** The strategy never sees fees (the live worker
  must not), so a fee-paying account comes back a hair short of true flat.
- **The identity that makes it safe:** the gain booked on the cash-back sale is
  exactly the cost still carried by the coins held. So if the runner ends up
  worthless, the cycle closes flat rather than at a loss. There is a test for this.
- **If the bounce level sits at or below the average cost** there is nothing left
  to ride, so it simply sells the lot and ends flat. Same if **Sell below base %**
  is set deeper than the first rung's step — the runner must never rest cheaper
  than the sale that returns the money, so the two orders collapse into one.
- **The stop loss is untouched.** As with the other rung styles, the average-price
  take profit is switched off and only the stop can force-close the position.
- **Old ladders are unaffected.** `sellBelowBasePct` defaults to 2 and no other
  take-profit style reads it.
- Chart labels for the two fills are **Money back** and **Free ride**.

### Not yet verified in a browser

The dropdown entry and the new **Ladder exits** card on the DCA node have unit
tests and a clean typecheck behind them, but no browser pass — the app's dev
server was not running. Do that before trusting the UI.

## Where the ladder's settings live (July 25, 2026)

The DCA node owns every setting its own rule reads, in four cards in the inspector:

1. **Base break** — Crack below base %, Maximum fall (candles). What starts the
   ladder.
2. **Past base quality** — the recovery filter, its history window, the minimum
   share respected, and the recovery target. The three numbers grey out when the
   filter is off.
3. **Ladder** — the pot preview, the rung table (deviation + computed buy size),
   add/remove rung.
4. **Sizing and fills** — max position %, size ramp, compound vs fixed, market vs
   limit, and the 2-green step-down toggle.
5. **Ladder exits** — Sell below base %, read only by the "Money back at nearest
   rung, then ride free" take-profit style above.

Those first two cards used to sit on the **Base indicator** node, labelled "Base
break (DCA node)" — a parameter parked on a neighbour, with the owning node's name
in its own group title. The Base node now supplies only `basePeriods` /
`pumpPeriods` (where the levels are); everything about breaking a level is here.
Graphs saved before the move fall back to the same defaults the Base node carried
(crack 2.5%, max fall 4, filter off), and no saved automation used a DCA node at the
time of the move, so nothing changed behaviour.

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
