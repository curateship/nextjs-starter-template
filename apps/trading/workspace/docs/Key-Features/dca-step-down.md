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

## Take-profit style "Money back at nearest rung, then ride free" — REMOVED (July 28, 2026)

Added July 25, 2026 as a fourth **Take profit style**; deleted three days later at
the user's request. It rested two sells instead of one — enough at the nearest rung
above the deepest buy to hand back every dollar spent, then the leftover coins just
under the base for the profit. Gone with it:

- the dropdown entry and the **Ladder exits** card's *Sell below base %* field
  (that card now holds only *Give up after (candles)*);
- `sellBelowBasePct` on the DCA node and on frozen run configs, and its default;
- the engine's two-sell block, its `dca:s:cash` / `dca:s:free` fills and the
  **Money back** / **Free ride** chart labels, and the per-cycle `spentUsd` /
  `recoveredUsd` bookkeeping that only it read;
- the `dca_money_back` event and the "DCA base respect" summary row's neighbour
  case in the strategy summary.

Saved automations and frozen configs still load: `moneyBackThenBase` is rewritten
on read to **`nearestRungSellAll`**, which rested its first sell at exactly the same
level, so it is the closest surviving behaviour. This is the same treatment the
earlier `previousRungHoldFirst` mode gets, and there is a test for each.

The three surviving styles are *At the average price*, *Sell at previous rung* and
*Sell everything at nearest rung*.

## Where the ladder's settings live (July 25, 2026)

The DCA node owns every setting its own rule reads, in four cards in the inspector:

1. **Base break** — Crack below base %, Maximum fall (candles). What starts the
   ladder.
2. **Only buy in an uptrend** — the trend gate, its average length, and whether a
   broken trend also sells.
3. **Ladder** — the pot preview, the rung table (deviation + computed buy size),
   add/remove rung.
4. **Sizing and fills** — max position %, size ramp, compound vs fixed, market vs
   limit, and the 2-green step-down toggle.
Three cards were deleted on July 28, 2026 at the user's request: **Past base
quality** (see below), *Sell below base %* (it went with the money-back take-profit
style above), and the whole **Ladder exits** card — see below.

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

## Past base quality removed (July 28, 2026)

Asked for by the user. The filter that only let the ladder trade markets whose
past cracks had recovered is gone, and so are its three numbers (history months,
minimum share respected, recovery target). Deleted with it:

- the inspector card, the node and frozen-config fields, and the scoring code
  that scanned months of history each idle bar;
- the "DCA base respect" row on the strategy summary;
- the shared wallet's past-recovery tie-break, so competing markets are now
  ranked by crack-volume strength, then daily volume, then name.

Saved automations and frozen backtest/bot configs still load — the four removed
keys are ignored on read, and the filter shipped switched off, so no saved ladder
changes behaviour.

Two knock-on effects worth knowing:

- A ladder now needs only hundreds of candles of history (the base window, the
  trend average, any confirmations) instead of up to five years of them, so
  `dcaHistoryBars` no longer depends on the timeframe.
- With that gone, the worker's one-million-candle ceiling on a shared-wallet
  basket can no longer be reached at the 200-market cap. The check stays as a
  backstop, but its test now asserts the opposite: a one-minute three-market
  basket is accepted.

## Number boxes you can actually empty (July 28, 2026)

Reported as a persistent problem across the app: clearing a number field snapped it
straight back to `0`, so an existing value could never be replaced by typing over
it. The cause is the same everywhere — a controlled `<Input type="number">` whose
value is a number. `Number("")` is `0`, that `0` goes up to the state, and it comes
back down as the box's value before the next keystroke.

The fix is `src/components/ui/number-input.tsx` — a `NumberInput` that keeps the
typed TEXT locally while the box is being edited and only pushes a number up when
that text is one. Clearing it leaves it blank and sends nothing; leaving the box
drops the draft, so a field abandoned while blank shows its saved value again
rather than silently becoming zero.

**Use `NumberInput` instead of `<Input type="number">` anywhere the value is a
number.** A field that stores `""` for "unset" can keep a plain `Input` — its value
is a string all the way down, so it already clears correctly.

Converted: every number box in the automation inspector (DCA, Market Scanner, Whale
Wall, indicator params, Look Back, take-profit/stop-loss percents, R&R ratio, target
equity %, rung deviations), plus **Max chart candles** in General settings and the
**Liquidation warning threshold** and **Default leverage** in Trading settings.
Everything else already held strings.

There is no unit test for the typing behaviour: this app's vitest runs in a `node`
environment with no DOM and no testing library, so keystrokes cannot be simulated
without adding a dependency. Verify it in a browser.

## Stop-loss level dropdown is gated on the node that supplies the level (July 28, 2026)

The Stop Loss node's **Stop sits at** dropdown offered "The session open — wire a
Sessions node in" whether or not one was connected. Picking it with nothing wired in
could only ever produce a validation error. Now each non-percent level appears only
once the node that supplies it feeds that stop — a Sessions node for the session
open, a Base node for the confirmed base (computed in the editor the same way the
DCA-only take-profit styles are). With neither wired in the dropdown is hidden
entirely, since a percent is then the only real choice. It stays visible for a stop
already SET to one of them — otherwise unwiring that node would strand it with no
way back to a percent.

## The give-up timer is gone (July 28, 2026)

Removed at the user's request, along with the whole **Ladder exits** card it was the
last field in. `maxCycleBars` — abandon a cycle open this many candles without
resolving — is deleted from the node, from frozen run configs, and from the engine.
Saved ladders still load; the key is ignored. It defaulted to 0 (never), so nothing
that was actually using it changes.

**Worth knowing what this gives up.** That timer was the ladder's only unconditional
way out of a losing cycle. Without it the remaining exits are the take profit, the
stop, and the optional "also SELL when the trend breaks" switch. A ladder that just
bleeds with the trend gate off will hold its bag indefinitely — which is exactly how
old tuned configurations scored 95% win rates while their real losses sat in open
positions. The new below-the-rung stop below is the honest replacement: it caps each
rung's loss instead of capping the cycle's length.

## Stop loss "The confirmed base" (July 28, 2026)

A third **Stop sits at** option on the Stop Loss node. Instead of a percent from
the entry, the stop sits **on the confirmed base itself** — the teal dash the Base
indicator draws. That level holding is the whole reason for the trade, so if price
loses it the trade is wrong and there is no point sitting through the rest.

It works exactly like the session-open stop, which is the pattern it copies:

- **The Base can be wired into the stop OR into the entry the stop guards.** On the
  ordinary `Base → DCA → Stop Loss` graph the ladder is already fed by a Base, so
  the stop looks one hop through its entry (a DCA node or a Long/Short action) and
  finds it — demanding a second wire straight from the Base to the stop would be
  pure ceremony. A direct wire still works, and is the only option when the entry
  is not Base-driven. The dropdown option appears exactly when the compiler can
  find a Base by either route.
- **The base's own detection settings ride along** onto the compiled config
  (`basePeriods` / `pumpPeriods`), so the stop finds the *same* level the chart
  paints rather than guessing its own.
- **The price is read once, when the trade opens**, and held until it closes — the
  stop cannot wander onto a later base mid-trade.
- **It cannot also trail.** One fixed price is not a moving one, so the
  Fixed/Trailing control and the trailing activation field are hidden and compile
  rejects `mode: "trailing"` beside it.
- **The percent stays as the fallback** for a trade opened before any base has
  confirmed. There is always a stop; it is just the configured percent instead of
  the level.
- **Shorts mirror it**: the level is the confirmed *ceiling* above the entry
  (`ceilingLevels`), which is that side's version of the same thing. If the level
  lands on the wrong side of the entry it would be a take-profit, not a stop, so
  the percent stands.

### On a DCA ladder it also keeps the ladder standing

A ladder buys BELOW the base it cracked, so the base that started the cycle always
sits above the entry — a stop there would be a take-profit, not a stop. What the
ladder's stop tracks is therefore the base **in force now**: as price steps down and
the Base indicator confirms a new, lower base, that becomes the level. The first one
below the entry is the first that can actually fire. (The plain automation engine
freezes its level at entry instead, because a signal entry sits ABOVE its base from
the start and has no reason to follow a later one.)

And when it fires on a ladder, **the cycle is not over**:

> Getting stopped out of rung 1 is one rung's attempt failing, not the whole idea
> failing. The position is sold, the ladder goes flat — nothing held, no stop
> resting — and rung 2 is still next. It buys at its own level with a fresh stop
> under whatever base is in force then. Only when the rungs run out does the cycle
> end and a new base have to confirm.

This is deliberately tied to the confirmed-base level, which is opt-in. **A ladder on
a plain percent stop keeps its old behaviour** — the stop ends the cycle outright —
so no saved automation or frozen backtest result shifts underneath anyone.

`stepDownAfterStop` in the DCA engine does it, called wherever a flat position would
otherwise release the cycle. It marks the sold rungs fully sold so a peel/nearest-rung
take profit cannot rest sells for coins that are gone, and hands the market's room
back to the shared wallet while flat.

### Buy back after a reclaim (July 28, 2026)

**Buy back after (days above the base)** on the Stop Loss node, beside the level.
0 or blank = off, which is how every ladder behaved before.

The case it exists for: the stop cuts you at a base, price immediately reclaims that
base, and then runs — the drop was a sweep that took the stops out and nothing more.

- After a base stop fires, the level it was cut at is remembered.
- Price closing back **above** that level starts a clock.
- Keep closing above it for the configured span and the trade goes back on: at
  market, the **same size** the stop sold, restoring the **same rung** — not the next
  one down, so the ladder is put back exactly where it stood.
- A **close** back under the level resets the clock to zero. A wick under it does
  not: that noise is the whole thing this is meant to sit through, and using lows
  instead would let one spike throw away days of waiting.
- The stop that follows sits under whatever base is in force by then — ordinary
  behaviour from that point on.

You always buy back **higher** than you were stopped at. That is the price of waiting
for proof, and it is the honest cost of the setting.

**Reclaim regression tests** (`dca-automation.test.ts`): one tape stops out at 82,
holds above it for a day, and buys back the same rung at the same size above 82 —
with the setting off, the same tape never buys back. A second tape holds above the
base for almost a day, closes under it ONCE, then holds again for less than a day:
no buy-back, because the close under it restarted the wait.

### The runaway it caused, and the rule that stops it (July 28, 2026)

Found on SOLV: one cycle reached **$76,750** against a $25,000 pot. Rung 5 bought
four times, doubling every round — $12,014, $20,893, $40,215, $76,751.

The cause was in the step-down. It marked the sold rungs `soldSz = filledSz` but
left `filledSz` in place. A reclaim buy then ADDED to that rung's `filledSz`, the
next `reclaimArmedBy` summed the inflated figure, and each stop → reclaim → stop
round bought back double the last. The stop sells everything, so the ladder holds
nothing: `filledSz` and `soldSz` now both go back to **zero** on a step-down, and
`entryComplete` alone is what stops those rungs buying again.

The rule, in Tyler's words: **"once it reaches the last rung and gets stopped out,
it's done. It should not buy anymore."** With no unbought rung left the step-down
declines, the cycle is released, and no reclaim is armed — so nothing buys back
however long price holds above the base afterwards. A fresh base has to confirm.

Two regression tests cover it: four rounds of stop-and-reclaim where no buy may cost
more than the first and the position never exceeds the pot; and a two-rung ladder
whose last rung stops out, after which 200 bars back above the base buy nothing.
Checked against every cached market too — 569 markets on 4h, worst peak $21,539
against the $25,000 cap, nothing over.

### The doubling is the design; the cap is what matters

The ladder's 2x size ramp means each rung bets twice the last, and with the
step-down selling everything between rungs that reads as doubling after each loss.
**That is intended** — checked with Tyler, July 28, 2026. What must hold is the
ceiling: no buy may exceed the LAST rung's budget (25.20% of equity on the
7-rung / 2x / 50%-pot ladder), and once the last rung has bought and been stopped
out the cycle is finished.

Measured across every cached market — 569 on 4h — the worst single buy is **108%**
of that ceiling, and only **4 markets** exceed it at all, all on the deepest rung and
all by 3–8% (FLOW, KAVA, SAHARA, STRK). Those are fill-price and equity-timing
variance on a resting limit, not the runaway. Before the `filledSz` fix above, SOLV
was reaching 3x the whole pot.

**The reclaim is capped in dollars, not coins.** Buying back the same coin count
would spend more the further price had run since the stop — SUI reclaimed 266 days
later at 3.4x the stop price — so it is held to the budget of the rung it is putting
back, like every other buy.

**Not measured.** The number of days is a knob, and one chart is not evidence. Run it
off and on through the full method — 20+ markets, real costs, walk-forward — before
believing it helps.

**Ladder regression test** (`dca-automation.test.ts`): base 90 confirms, rung 0 buys
at 84, price shelves at 82 so a new base of 82 confirms below the entry, then breaks
it. The exit fills at exactly **82**, and rung 1 still buys afterwards at its own
level. The same tape with a plain 50% stop never stops out at all.

**Regression test** (`automation-backtest.test.ts`): a tape where the Base
indicator confirms 90, a breakout buys the close at 109, and price then falls
through. The exit fills at exactly **90**. The same tape with a plain 50% stop
never exits at all — 50% below 109 is 54.50, which the tape never reaches. That gap
is the whole point of the mode.

**Where it is implemented.** `stopLossLevel: { kind: "confirmedBase", basePeriods,
pumpPeriods }` on the compiled protection. Both engines resolve it through the same
`resolveProtection`, which turns any anchored price into a percent once, in one
place — the plain automation engine computes the level from `baseLevels` /
`ceilingLevels`, and the DCA engine reads its base tracker's current base. The
`ExitState.sessionOpenPx` field was renamed **`stopLevelPx`**, since it now carries
either kind of level.

**Not verified in a browser or on a live bot.** Unit and backtest coverage only.

### A wrong turn worth remembering

This was first built as "below the rung it bought at" — a percent under the DCA
ladder's current rung, where firing it sold out and stepped the ladder to its next
rung. That is not what was asked for and it was removed. "A stop under the base"
means the base **level**, the dash on the chart. If a future request mentions the
Base, check whether it means the **Base node** before inventing new mechanics.

## A retired stop level must never make an automation unopenable (July 28, 2026)

The short-lived `belowRung` stop level above reached the running dev server, and an
automation ("QFL") got **saved** with it. Replacing the level then made that
automation fail to parse, and every attempt to open it returned the generic
**"Automation request failed."** toast — the fallback in `lib/api/automations.ts`,
which deliberately hides server errors from the client.

`level` now runs through a preprocess that turns any unrecognised value into
`"percent"`, the same shape `takeProfitMode` already used for its two retired
modes. There is a test for it.

**The rule this makes concrete: never narrow a saved enum without a fallback.** A
zod `z.object` silently drops unknown *keys*, so removing a field is safe — that is
why deleting `sellBelowBasePct`, `maxCycleBars` and the past-base-quality fields
broke nothing. Removing a *value* from an enum is not safe: it fails the whole
parse and takes the entire automation with it. Add the preprocess in the same
commit that retires the option.

Two side notes from checking every saved automation in the local database against
the schema:

- Worth doing after any schema change. A loop over `trading_automations` that runs
  `automationGraphSchema.safeParse` on each row catches this class of break in
  seconds.
- **"Smart DCA" does not parse, and never did on this branch.** Its first node has
  `kind: "smartDca"`, a node type that no longer exists anywhere in the code. An
  unknown node KIND cannot be degraded the way a field value can, so it is left
  alone and recorded here — pre-existing, unrelated to this batch.

## The backtest market cap now moves with the window (July 28, 2026)

`MAX_EXTRA_MARKETS` was 50, so every run was pinned to **51 markets** whatever the
timeframe or window. Halving the window bought nothing, and "Randomize markets"
filled the same 51 slots each time — which is what Tyler hit and reported as broken.

It is now 500: a runaway backstop, far above the ~500 Binance USDT perps, so the
thing that actually binds is `MAX_TOTAL_RUN_BARS` (1,000,000 candles per run) — and
that already scales the right way, because a market costs its window of candles plus
the strategy's warm-up. The server still rejects an over-budget basket with a message
naming the real number.

What that gives at 4h, with no warm-up configured:

| Window | Markets |
| --- | --- |
| 2000 days | 74 |
| 1000 days | 133 |
| 500 days | 222 |
| 1 day (`1d` candles), 2000 days | 460 |

Not exactly double per halving: the warm-up is a fixed per-market cost that does not
shrink with the window. "Randomize markets" already filled to whatever the cap was,
so it picks up the larger basket for free.

### The 100-id progress limit it exposed

Raising the cap immediately broke the results table: a 158-market run showed a dash
in every column. The runs were fine — TIA had 49 trades, CRV 52, all stored — but
`pollBacktestProgress` validates `ids` at **max 100**, so asking for the whole basket
failed outright and the table had no stats to render.

`pollBacktestProgress` now splits the basket into 100-id requests itself, so no
caller has to remember the limit. The strategies dashboard had grown its own copy of
that batching; it now just calls the helper. There is a test tying the two together:
the largest basket the market cap allows must need more than one batch.

**Lesson:** raising a limit is never local. Anything downstream that assumed the old
ceiling — request schemas, page sizes, id-array validators — breaks silently, and a
table full of dashes looks like a broken backtest rather than a failed fetch.

## Crack settings removed — they were dead (July 28, 2026)

`crackPct` ("Crack below base %") and `maxCrackBars` ("Maximum fall") were in the
inspector, saved on the node, compiled into the config and reported in the strategy
summary — and **read by no engine**. Sweeping crackPct across 3/4/5/7/9 over 143
markets returned byte-identical results every time: same net, same 3,138 trades.

They stopped being read on **July 24, 2026** in b60744d5 ("Add DCA step-down entry
and per-rung sizing/exit options"), which replaced
`threshold = currentBase * (1 - crackPct / 100)` with
`baseArmable = currentBase !== null && last.c >= currentBase`.

So the ladder does NOT wait for a crack. It arms when a base is confirmed and price
is at or above it, then rests its rungs at their deviations below. Both fields are
now gone from the node, the config, the schemas, the summary row and the "Base break"
card (which held nothing else). Saved graphs and frozen configs still load — the keys
are ignored, exactly as with the other removals.

**The lesson worth keeping: a setting nobody reads looks like a working knob.** After
changing an entry rule, sweep every parameter that is supposed to feed it; identical
results across a wide sweep means the wire is cut.

## The shared wallet was letting the basket spend cash it did not have (July 28, 2026)

Found while stress-testing QFL. The DCA engine reserved each market's exposure at
**mark value** (`midPx x heldSize`), not at what it had **spent**. Marking to market
frees room that does not exist in cash: spend $50k, watch it halve, and the ledger
reads 50% committed — so another market spends the "free" half.

Measured directly by summing every buy and sell across the basket over time:

| Basket | Peak CASH deployed vs a $50,000 wallet |
| --- | --- |
| 137 coins, before | 110% |
| 137 coins, after | **99%** |
| 592 coins, before | 241% |

The fix reserves the broker's blended entry price times held size — the cash actually
committed — so the ledger bounds the wallet the way a real account is bounded.

**It is only a partial fix.** At 592 coins the basket still reaches ~315% (and ~1,182%
on market entry), so the ledger is still under-counting somewhere at large basket
sizes. `setExposure()` is also the one write path that does not check the cap, unlike
`reserve()` and `restore()`. Until that is chased down:

- **Baskets up to ~150 markets are trustworthy** — peak cash now lands at or under
  100%.
- **Anything past ~300 is not.** Results there simulate an account with several times
  the money.

The check that catches this is cheap and worth repeating after any wallet change: sum
`+px*sz` on buys and `-px*sz` on sells across the whole group, sorted by time, and
watch the running total. It can never exceed the wallet.

### What this did to the QFL numbers

Regime test, 87 coins listed throughout, identical windows for the strategy and the
hold benchmarks:

| Window | QFL | Hold those alts | Hold BTC | Peak cash |
| --- | --- | --- | --- | --- |
| BEAR 2021-11 -> 2022-11 | -39.4% | -82.8% | -75.9% | 213% (untrustworthy) |
| BULL 2022-11 -> 2024-03 | +20.6% | +196.7% | +356.4% | 68% |
| BULL 2024-03 -> 2025-09 | +57.1% | -40.9% | +55.9% | 86% |
| BEAR 2025-09 -> 2026-06 | +20.1% | -57.4% | -47.9% | 100% |
| ALL 2021-11 -> 2026-07 | +62.8% | -76.9% | -4.5% | 213% (untrustworthy) |

The full-window figure fell from +238.6% to +62.8% once exposure was measured at cost.
The two windows where the wallet stayed inside its budget are the only ones to quote.
