# Base indicator — what it marks, and what it is worth

The Base indicator finds the levels where price recently found a **floor**
(support, called a *base*) or a **ceiling** (resistance). It draws each one as a
short flat dash and prints an arrow when a new one is confirmed.

**Read "What it is worth" at the bottom before trading any of it.** The signal was
measured across 21 markets and four timeframes on 24–25 July 2026: it has no edge,
and random entries with the same stops did better. It is a level finder, not an
entry trigger.

## How a level is found

Two settings do the work, and they behave the same on both sides.

**Base periods** — how far back to look. With 24, at every candle it looks over the
last 24 candles for the lowest low (a base) and the highest high (a ceiling).

- Bigger (say 100): only the deepest low / highest high over a long stretch counts.
  Few levels, but the ones that matter.
- Smaller (say 16): every small dip becomes a "level". Many, mostly meaningless.

**Pump periods** — how long that extreme must survive before the level is official.
With 6, the low must stay the lowest for 6 more candles. A new lower low before then
throws the candidate away and restarts the wait.

So a level is not confirmed at the extreme itself — it is confirmed **Pump periods
later**, and that is where the arrow prints. This is why an arrow can sit well away
from its own dash: by the time a base confirms, price has usually bounced. On ETH
daily, all 7 bases confirmed in 500 days had their confirming candle close **11–20%
above** the base. That is accepted, not corrected — judging whether price is close
enough to a level to act is the **Price Action indicator's** job.

**Frequency comes from these two numbers, not from the filters below.** Measured on
ALGO 15m over 10 days: base 120 / pump 7 found 8 bases; base 24 / pump 6 found 25.

## The two sides

| Setting | What it draws |
| --- | --- |
| **Show long arrows (bases)** | teal dash + green up arrow at each confirmed base |
| **Show short arrows (ceilings)** | red dash + red down arrow at each confirmed ceiling |

Both default to on; the indicator finds both in one pass, so hiding one is purely a
display choice. Leaving both on is useful for a short: the entry is the ceiling, and
the base below it is where you would take profit.

## The two filters

**Only levels with the trend** (on by default) — long marks a base only if it sits
**above** the base before it (a higher low); short marks a ceiling only if it sits
**below** the ceiling before it (a lower high). Off marks every level.

This is usually why a level has a dash but no arrow. On ALGO 15m at base 24 / pump 6
it hides **14 of 25** bases.

**Minimum candles between arrows** (default 20) — two arrows on the same side can
never be closer than this. Each side keeps its own clock, so a long never crowds out
a short.

## Does it decide live the same way it decides on history?

Yes. Both filters only look backwards — at the previous level and at the last arrow —
so a live bot reaches the same verdict as the chart, and an arrow never disappears
once printed. Note what that does and does not buy you: the spacing filter fires on
the *first* arrow of a cluster and blocks the ones after it, so it protects you from
being chopped repeatedly, not from the first trade.

Guaranteed by a test rather than by argument: `parity.test.ts` replays every prefix
of a 600-candle series and requires each prefix's marks to match the full series up
to that candle. If anyone writes a rule that peeks ahead, that test fails.

## What this indicator deliberately does not do

**It never signals a level breaking.** Price cracking below a base ("the crack") is
the DCA ladder's rule and lives on the DCA side: the ladder tracks bases itself in
the worker engine (`worker/src/engine/dca-automation.ts`, helpers in
`lib/automations/qfl.ts`) and never reads this indicator's signals.

Why they stay apart: both events are *buys*, and the chart draws every buy as a green
up arrow. Having both in one indicator meant two different events drew two identical
arrows with no way to tell them apart (24 July 2026).

The crack settings — **Crack below base %**, **Maximum fall (candles)** and the
past-base-quality filter — live on the **DCA node**, not here (moved 25 July 2026).
This indicator hands the DCA node only `basePeriods` / `pumpPeriods`: where the
levels are. Deciding what breaking one means is the ladder's business.

## Filter designs that were wrong (do not reintroduce)

All from 24 July 2026, each caught by looking at a real chart:

1. **A proximity rule** ("only mark within 1% of the level") plus a **staleness
   window**. Duplicated the Price Action indicator's job, and on the settings in use
   the proximity rule printed nothing at all.
2. **Candle colour** ("two green candles in a row"). A run of green candles can step
   downhill, so arrows landed mid-fall.
3. **Comparing the arrows instead of the levels.** A confirming candle can close
   *higher* than the last arrow while its level is *lower* — real case on ETH 1h:
   levels 1778.8 → 1750.5 but closes 1821.0 → 1881.8. The lower level drew an arrow,
   so arrows marched down a staircase.
4. **Comparing against the last level MARKED** (with a downward reset) instead of the
   one immediately before. Every small bounce in a fall beat the skipped level below
   it, so arrows clustered a few candles apart at one price.
5. **A toggle plus a percentage**, where the percentage did nothing while the toggle
   was off. 20 was typed in with the toggle off and nothing changed, with nothing on
   screen explaining why. Never ship a setting that can be silently inert.
6. **A percentage at all.** In a market whose whole range is 2% wide, no useful
   percentage can be cleared, so every value gave one or two arrows a month.
7. **An "only higher bases" switch** measuring against the highest level ever marked.
   The default comparison already means "higher than the one before", so the switch
   could only be redundant or destructive — it left 1 of 11 arrows.

## What it is worth as a trading signal: nothing

Measured following `backtesting-guide.md`: 21 Binance USDT-perp markets (high/mid/low
volatility), walk-forward 60/40, real costs (0.045% taker + 0.04% slippage per side),
full-account bet, no leverage, stop taken first when a candle held both levels.

Short at a confirmed ceiling, stop just above it, take profit at RR × the stop
distance. Out-of-sample, net of costs:

| Timeframe | RR | Trades | Win rate | Coins green | Net |
| --- | --- | --- | --- | --- | --- |
| 15m | 1:1 | 896 | 50% | 3/21 | **−4.49%/month** |
| 15m | 1:2 | 814 | 32% | 3/21 | −5.46%/month |
| 1h | 1:1 | 856 | 55% | 9/21 | +0.96%/month |
| 4h | 1:1 | 250 | 54% | 11/21 | +0.45%/month |
| 1d | 1:1 | 70 | 61% | 14/21 | +0.71%/month |

Long at a confirmed base with the mirrored stop: −4.19%/month out-of-sample at 15m,
31% win rate. Both sides lose.

Three findings from that work, each worth more than the indicator itself:

- **The win rate sits exactly on the break-even line at every risk-reward ratio** —
  50% at 1:1, 40% at 1:1.5, 32% at 1:2. That is what a signal with no directional
  edge looks like. Changing the ratio trades win rate for win size and nothing else.
- **Costs, not direction, decided the 15m result.** Gross was −0.32%/month; fees and
  slippage took it to −4.49%. The drag falls from ~4%/month at 15m to ~0.03% at 1d
  purely because there are fewer trades. Inverting a loser does not fix this: the
  flip of the losing short earned +1.36%/month gross out-of-sample and still lost
  2.57% net, because both directions pay the same toll.
- **Random entries beat it.** Identical stop rule, identical 1:1 target, identical
  costs, 8 seeds averaged, one position at a time: random won in 5 of 6
  timeframe/setting cells (4h base 48/8 out-of-sample: indicator +0.45%/month, random
  +1.49%). Caveat: random resolves slower so its trade count is lower, and each cell
  is 100–900 trades, so the gaps are noisy — but the indicator does not beat a dart.

None of this ran through the app's backtest engine, so **there is no run group in the
database**: the engine's stop is a fixed percent from entry, and this rule needs the
stop at the level, a distance that ranges 0.28%–6.7% across the basket. Funding costs
are not modelled either, which matters at these magnitudes.

**Conclusion:** use it to see where support and resistance sit. Do not wire it to an
entry expecting an edge, and do not spend more time tuning its filters — the problem
is not the parameters.

## Settings summary

Trade chart card and Automation node:

| Setting | Meaning |
| --- | --- |
| Base periods | How many candles back to search for the extreme. |
| Pump periods | How many candles it must hold before the level is official. |
| Show long arrows (bases) | Draw the support side (default on). |
| Show short arrows (ceilings) | Draw the resistance side (default on). |
| Only levels with the trend | Long needs a higher low, short needs a lower high (default on). |
| Minimum candles between arrows | Closest two arrows on one side may appear (default 20). |

That is the whole set, on both the chart card and the Automation node. The crack
and past-base-quality settings that used to sit here are on the DCA node now.

## Where the code lives

- Indicator: `src/lib/indicators/defs/base.ts` (one compute path for chart, backtest
  and live bot).
- Level detection: `qflBase` and its mirror `qflCeiling` in
  `src/lib/strategies/indicators.ts` — each returns the level in force, the dash to
  plot, and the bar it was confirmed on.
- Chart card settings: `src/lib/trading/indicators-config.ts`; dashes and arrows are
  drawn in `src/components/chart/price-chart.tsx`.
- The parity rules that govern all of this: `indicator-strategy-parity.md`.
