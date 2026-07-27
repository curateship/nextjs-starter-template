# Sessions indicator — the shading, and the opening-run signal

The Sessions indicator shades the hours of one trading session on the chart
(New York, Tokyo, London, or one of the fixed crypto blocks). Since 26 July
2026 it also **signals**: it watches the candles from the moment a session
opens and marks the first strong run of three.

## The rule, in plain English

Once a session opens, the indicator counts candles. It is looking for **three
candles in a row of the same colour**:

- three green (each closed higher than it opened) → a **long**, green up arrow
- three red (each closed lower than it opened) → a **short**, red down arrow

Three matching candles are not enough on their own. Two more conditions:

**The run must not fade.** Of the second and third candles, at least one must
have a body **as big as or bigger than** the first candle's. "Body" means the
distance from open to close — the coloured block, wicks ignored. Three green
candles that get smaller and smaller are a rally running out of breath, not a
move to join.

**The last candle must not be a rejection.** Going long, the third candle
cannot be an **inverted hammer** — a small body sitting at the bottom of the
candle with a long wick above it, which says the market tried higher and got
sold. Going short, it cannot be a **hanging man** — the mirror image, a small
body at the top with a long wick below, which says buyers defended the low.
Either shape means the third candle contradicts the run it is supposed to
confirm, so the signal is thrown away.

How long a wick has to be to count as a rejection is the one number you can
tune: **Wick/body ratio**, default 2 (the wick must be at least twice the
body). It means exactly what the same setting means on the Price Action
indicator.

## What "the first run" means

- **Counting restarts at every session open.** Candles from the quiet hours
  before the open never count towards a run, even if they are the same colour.
- **A session fires at most once.** The first run that passes every rule prints
  its arrow, and the session then stays quiet until the next one opens. A run
  that fails a rule does *not* use up the session — the indicator keeps
  looking, three candles at a time.
- **A candle belongs to the session** when its open time falls inside the
  session's hours, the same boundary the shading snaps to. A run that would
  only complete after the close does not fire.
- **A session already running when the chart's data begins is skipped.** Its
  opening candles are missing, so "the first run of the session" cannot be
  answered honestly, and guessing would make a live bot disagree with the
  chart.

A candle that closed exactly where it opened has no colour and breaks the run.

## Where it appears

One module (`src/lib/indicators/defs/session.ts`) does all of it, so the
[parity rule](indicator-strategy-parity.md) holds:

- **Trade chart** — pin Sessions on the Indicators page, switch it on in the
  chart's Indicators menu. The shading and the arrows come from the same
  settings.
- **Automation canvas** — "Sessions" under Indicators. The node carries the
  same two settings (which session, wick/body ratio) and its Bullish / Bearish
  outputs are the long and short runs. Its **Trend** output can also be wired
  into a **Stop Loss** node, which is how a stop set to "the session open"
  learns which session to use — see
  [the canvas guide](automation-canvas.md).
- **Backtest and live bot** — the same compute, so a backtest of a Sessions
  automation shades its own session hours and marks the same candles the trade
  chart marks.

## Picking a timeframe

The signal needs at least three candles inside one session, so a timeframe
that puts one or two candles in a session can never fire. The NYSE session is
6.5 hours long: on 4h it holds one or two candles, on 1h six, on 15m twenty-six.
**15m or smaller is where this indicator has something to say.**

## What it is worth

Unmeasured. The rule is implemented and proven correct by tests, but it has
**not** been back-tested across markets, so there is no claim here about
whether it makes money. Before trading it, run it through the backtester the
way [the back-testing guide](../backtesting-guide.md) requires — many markets,
real costs, walk-forward, out-of-sample.
