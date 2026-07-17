# Higher-timeframe filter — design note and behavior

Lets an indicator node in an Automation watch a HIGHER timeframe than the bot
trades on — the classic "only take 15-minute entries while the 4-hour trend is
bullish". This doc is the design note (written before the code, per the task)
and the lasting reference for how it behaves.

## What it is, in one sentence

A **Timeframe node** sits on a Trend wire (exactly like Look Back) and moves
every indicator upstream of it onto one higher timeframe; their bullish or
bearish opinion is computed from closed candles of that bigger timeframe and
gates the entry exactly like any other Trend filter.

`EMA → Timeframe (4h) → entry indicator → Long` reads as: "the EMA watches
the 4-hour chart, and its opinion gates this entry."

## Config shape (additive — old configs stay valid)

- A new saved node kind `timeframe` with a required `interval` ("1m" … "1d").
  It is a wire node, not a per-indicator setting — same grammar as Look Back.
- The compiled `AutomationFilter` gains an optional `interval`: the compiler
  walks each trigger's upstream chain and stamps every indicator above a
  Timeframe node with that node's interval. Absent = the bot's timeframe.
- Nothing else in `AutomationConfig` changes; `v` stays 2, and old drafts,
  bot snapshots, and backtest rows keep parsing (no timeframe node = no
  `interval` fields = today's behavior byte-for-byte).

## Rules the compiler enforces (plain-English errors on the canvas)

1. The node's timeframe must be STRICTLY higher than the bot's, and a clean
   multiple of it (all supported pairs are; the check guards future
   intervals).
2. It sits on a Trend wire: it needs a Trend input from an indicator, and
   its output can only connect to an indicator — never straight to an
   action (the entry signal itself always runs on the bot's timeframe) and
   never to QFL (v1 — QFL's gate evaluates point-in-time on the bot series).
3. At most ONE distinct higher timeframe per graph (keeps live subscriptions
   and backtest data volume sane).
4. Look Back cannot share a signal path with a Timeframe node (v1 — "N
   candles" would be ambiguous between the two clocks). The connection rules
   already keep them apart; the compiler also rejects any compiled filter
   carrying both.
5. One gate, one clock: the same node may trigger entries on the bot
   timeframe while ALSO filtering through a Timeframe node — the engine
   computes it once per clock (its Bullish/Bearish stay bot-timeframe
   signals; its Trend through the node is the higher-timeframe opinion).
   What is rejected is the ambiguous shape: one node gating the SAME entry
   both through a Timeframe node and around it — there is no right clock
   for that gate, so the compiler says to give each timeframe its own copy.
6. Warmup must fit: the HTF indicator's warmup, plus enough HTF bars to cover
   the engine's evaluation window, must fit inside the same 1400-bar ceiling
   (`AUTOMATION_MAX_WINDOW_BARS`) applied per series.

## The no-lookahead rule (the heart of the design)

**A higher-timeframe candle's signal exists only after that candle CLOSES,
and it takes effect starting with the first trading-interval candle that
OPENS at or after that close.**

Implementation: an HTF signal's time is shifted from its candle's open time
to its close time (`t + htfMs`). The existing latch cursor compares signal
time ≤ base candle open time, so the shifted signal is first visible on the
base candle that opens at the HTF close — evaluated at that base candle's
close, one base bar after the HTF close. Live and backtest use the same
shift, and live gains a full base bar of slack so the freshly closed HTF
candle is guaranteed to have arrived — no race at simultaneous closes, no
live/backtest drift.

Worked example (15m bot, 4h filter): the 4h candle covering 00:00–04:00
closes at 04:00. Its signal is stamped 04:00. Base candles opening 00:00,
00:15, …, 03:45 (all 16 bars inside the window) still see the PREVIOUS 4h
value. The base candle opening 04:00 (evaluated at its 04:15 close) is the
first to see it.

Between HTF closes the latched value holds steady — exactly like any Trend
latch — so a 4h "bullish" opinion gates every 15m entry until the opposite
4h signal.

## Warmup and data-budget math

Two candle series, each with its own window, both capped at 1400 bars:

- Base series: unchanged — `automationWarmupBars` in bot-interval bars.
- HTF series: `HTF indicator warmup + ceil(baseWindow / ratio) + 5` bars,
  where `ratio = htfMs / baseMs`. The warmup covers the indicator; the
  `baseWindow / ratio` part guarantees an HTF opinion exists for every base
  bar in the evaluation window.

Live, the market hub's per-interval snapshot (1600 bars) always covers the
cap. In backtests the HTF series is a second Binance fetch starting
`htfWindow × htfMs` before the sim start — for a 200-bar 4h warmup that is
~33 days of extra 4h candles (≈200 rows, small next to the base series).
The compile-time fit check uses the worst-case base window (1400), so any
config that compiles can always load what it needs.

Candle alignment: both Hyperliquid and Binance stamp candles on UTC epoch
multiples of the interval, and the engine drops any HTF candle whose open
time is not aligned to its interval, so a misaligned vendor row can only
disappear, never shift the clock.

## Where each surface gets its HTF candles

- **Live worker**: `warmup()` adds the HTF interval, so the bot runner holds a
  second hub subscription per market. On every base candle close the strategy
  reads the closed HTF candles (`T ≤ now`) and hands both series to
  `evaluateAutomation`.
- **Backtest**: the queue fetches the HTF series from Binance next to the base
  series; the runner serves `ctx.candles(htfInterval, n)` from it with a
  monotone cursor (never a candle whose close is in the future).
- **Chart preview / paint**: no second data load — `evaluateAutomation`
  resamples the base candles it already has into HTF buckets (exact for
  OHLCV, complete buckets only). The ENGINE never resamples; only paint uses
  this fallback.

## Painting (v1 limits)

An HTF node's painted line values are stepped onto the chart only from the
moment the engine could see them (the same availability rule), so the chart
shows what the bot knew and when. Indicator modules that paint through
chart-native overlay configs (e.g. the EMA ribbon) skip those overlays for
HTF nodes in v1 — the chart computes such overlays at the chart's own
timeframe and would silently show the wrong values. Signal chips/arrows do
not exist anywhere (chips = real fills only, per the parity rules).

Note on the parity rule: the Timeframe setting lives on the NODE, not inside
the indicator's params, so the "one settings shape everywhere" contract for
indicator params is untouched — chart, canvas, backtest, and worker still
share identical param schemas.

## Fail-safe behavior

If the HTF series is missing or empty at runtime (hub not warmed yet, fetch
gap), the filter simply has no latched signal and BLOCKS its entries — the
bot trades nothing rather than trading unfiltered.
