# Manual Practice Mode

A flight simulator for hand-trading. You pick a market, the chart rewinds into
the past, and history plays forward one candle at a time. You never fill out an
order form — **the drawing is the order**.

## How it works

- Start from **Backtest → Practice**, or from the **Practice** button beside
  the wallet dropdown on the Trade page — both open the same setup modal,
  which asks for a market, timeframe, days back, starting money, and a
  risk-per-trade percent, then opens the session at `/backtest/practice`.
  Days back starts at 365. Picking a finer timeframe pulls the window down to
  what that timeframe can cover (a 50,000-bar ceiling: 520 days at 15m, 173 at
  5m, 34 at 1m) rather than failing on Start.
- The chart loads ~1500 candles of history behind the session start, and
  scrolling further left keeps loading older chunks — so support/resistance
  context never runs out. The deep runway also warms up indicators.
- The toolbar switches the **display timeframe** to the session's interval or
  finer (never coarser — coarse candles would blend bars the engine hasn't
  seen). The simulation always steps at the session's own interval.
- The **Indicators** menu is the live trading chart's own: the same per-user
  pinned set and settings (EMA lines, Bollinger, RSI, MACD, QQE, Price
  Action, Base, Sessions, Fair Value Gap…), computed only over revealed
  candles so nothing peeks at the future. Edits here persist to the live
  chart too (shared paint pipeline: `src/components/chart/indicator-paint.ts`).
- Replay speed is a dropdown: 1× / 5× / 15× / 30× / 60×, and **60× is the
  default** — practice is about getting to the next setup, and slowing down is
  one click away. The number is candles per second. Playing or scrubbing never
  resets the chart view — it follows the newest candles when you're at the
  right edge and stays put when you've panned back.
- **The speed you pick is the speed you get.** Time advances by how long the
  last frame actually took, measured off the real clock, so a heavy frame
  catches itself up rather than quietly running slow. A frame that took absurdly
  long (the tab was hidden, the laptop slept) banks at most a quarter second, so
  coming back never blasts through the session. Nothing is scheduled until the
  previous frame is finished, so playback work can never stack up behind itself
  and lock the page.
- Draw a long or short **position box** (the standard drawing tool) ahead of
  the playhead:
  - the **entry line** is a waiting order — it fills when price touches it;
  - the far edge of the **red zone** is the stop-loss;
  - the far edge of the **green zone** is the take-profit;
  - **A waiting order rests until price reaches it. Deleting the box is the
    cancel** — nothing else takes an order away. The box's right edge is the
    plan's width on screen and no longer an expiry.

    This replaced "the right edge is the order's expiry", which read as a
    feature and behaved as a bug. A clicked box is about 8% of the visible span
    — a couple of hours on a normal zoom — the tape runs `speed` candles per
    real second (60 by default), and price seldom returns to an entry inside
    that window. Measured in a browser: three orders placed at the live price
    were all cancelled unfilled within three seconds, every attempt. Widening
    the floor (20 → 96 candles, a day at 15m) did not fix it — orders still
    died in about a second and a half of watching. With the expiry gone, the
    same three orders filled. If stale plans ever need clearing again, do it
    with something the user can see, not a silent cancel.
  - **A resting order's box travels with the tape**, keeping wherever you last
    dragged it. A drawing is anchored to the moment it was made, which is right
    for an annotation and wrong for a live order: at 60× the tape carried a
    just-placed box off the left edge in about two seconds (measured: x 807 →
    −183), where it could be neither seen nor grabbed. So the box is carried
    forward by however much tape has run **since it was last touched**
    (`displayDrawings` in `manual-session.tsx`, shifting a copy — the stored
    drawing is not rewritten every frame). An open position instead keeps its
    left edge at the entry and grows its right edge with the tape, so the
    trade's own history stays honest and its stop and target stay reachable.
    The engine's snapshot carries `boxId` on both `pendingEntries` and
    `positions` so the screen can tell which is which.

    **Re-anchor on every set the chart hands back, mid-drag included**
    (`onDrawingsChange`, not just `onDrawingsCommit`), so the travel offset is
    zero while a gesture is in flight. Anchoring only on commit meant each
    pointer move was re-pinned against a stale anchor and sideways drags were
    undone as fast as they were made — the box could only be moved up and down.
  - **The chart keeps 40 empty bars to the right** (`PLAN_ROOM_BARS`, passed to
    `PriceChartView` as `rightOffsetBars`; every other chart keeps 12). A box is
    drawn forward from the click, so with the usual sliver of room a trade
    planned at the live price landed 87% off-screen and looked like a click that
    never registered — which is how the same trade got drawn twice. Measured:
    13% of the box visible before, 42% after.
  - **Placing an order says so**: a toast reads "Buy order waiting at 187.91 —
    rests until price reaches it. Delete the box to cancel."
- Position size is automatic: each trade risks the chosen percent of the
  current wallet to its stop. Tighter stop = bigger position. Notional is
  capped at 10× equity.
- While a position is open, dragging the red/green edges moves the live
  stop/take-profit. Deleting the open position's box is the manual market
  close. **Every drawn box trades independently** — several waiting orders
  can trigger and run as concurrent positions, each with its own stop and
  take-profit; each new fill sizes its risk off the cash that's left.
- **Time only moves forward** during a session — play, pause, speed, and step,
  but never rewind. That keeps the scorecard honest.
- **Time holds while you draw**: arming a drawing tool or dragging a box
  pauses the tape until you release, so the axis can never slide under your
  cursor mid-gesture and the chart never lurches to catch up afterwards.
- **Drawing does not stop the tape** beyond the gesture itself. Auto-pausing on
  every new box was tried and reverted: it froze time silently, so a session
  where you drew a plan and waited looked exactly like one where nothing
  worked. Pause yourself, or drop the speed, if you want to study a setup.
- **Chart/data drift self-heals.** The candle sync samples the chart's own
  series against the array it was handed (every `DRIFT_CHECK_EVERY` renders —
  asking costs a copy of the whole series, so it can't run per frame). A
  mismatch means an append happened where a repaint was needed; left alone it
  lasts the rest of the session and drags every time-pinned drawing out of
  place. It now repaints on the spot, and still reports the red "Chart data
  drifted" banner in dev so the underlying cause stays visible.
- **Frame-locked drawings**: the drawing overlays commit their new positions
  in the same rendering pass as any chart movement (follow, pan, zoom,
  resize), so boxes and trendlines stay welded to their candles at any
  replay speed. The chart scrolls smoothly during playback, exactly like
  the live trading chart.
- The HUD strip shows wallet, open P&L, realized P&L, trades, win rate, max
  drawdown, working orders, and effective leverage in real time.
- **You always know when you're in a trade**: an open position paints
  full-width price lines with axis labels — a bold "Long/Short entry" line
  plus dashed Stop and TP lines — and every waiting order paints an amber
  "Buy/Sell waiting" line. Your own fills are lettered chips (O = opened,
  C = closed) in the trade's side color, visually distinct from indicator
  signal arrows.
- **Spacebar** starts and pauses playback (ignored while typing, while a
  modal is open, or while focus sits on a button/menu — those keep their own
  Space behavior).
- **2nd timeframe window** (toolbar toggle, remembered per browser): a
  draggable floating mini chart over the main chart — the same market at any
  other timeframe, always clipped to the same playhead. View-only (pan/zoom
  inside it, no drawing). Finer timeframes fetch native candles; **coarser
  timeframes are aggregated client-side from revealed candles**, so the
  newest 1h/4h bucket forms live instead of leaking its future the way a
  natively fetched coarse candle would (`aggregateCandles` in
  `src/lib/backtest/replay.ts`, unit-tested). Defaults to the next timeframe
  up from the session's.
- **Auto-pause** (toggle on the transport bar, remembered per browser):
  while on, playback stops at your decision points. Flat with no working
  orders → it pauses when an enabled indicator prints a new signal arrow, so
  you can read the setup and place a box. Once a box is in play (waiting
  order or open position) → signals no longer pause; instead it pauses when
  a stop-out or take-profit lands, so the result sinks in before time rolls
  on. Manual closes (deleting the box) never pause.
- **Live Trade**, beside Done in the session header, leaves for the live Trade
  terminal on the session's market. An unsaved session warns first, the same
  as any other way out.
- **Done** freezes the session (open position force-closed at the last price)
  and opens a **summary modal** with the scorecard — net P&L, win rate,
  profit factor, max drawdown, trades, Sharpe, time traded (played span out
  of the window, plus first entry → last exit), ending wallet, fees, and buy
  & hold. Its footer offers three choices: **Save run** (into the backtest
  history), **Restart** (same market and window, fresh wallet), or **New run**
  (reopens the setup modal seeded with the current config). Closing the
  modal keeps the ended session on screen; the header button reopens the
  summary. Leaving an unsaved session warns first — except right after
  choosing Restart or New run, which are explicit discards.

## Honest fill rules (client engine, `src/lib/backtest/manual-sim.ts`)

- Entry fills at its own price when the bar's range trades through it; a bar
  that gapped past the entry at the open fills at the open.
- Gap through the stop exits at the **open**, not the stop price.
- When entry, stop, and target all sit inside one candle, the **stop wins** —
  never the optimistic read.
- Maker fee on touched fills, taker on gaps/stops/market closes; default
  Hyperliquid fee tier.
- Wallet at zero halts the session: everything flattens, new fills refuse.

## Where sessions live

A finished session saves as a normal `backtests` row with
`params.kind: "manual"` (no automation, born `status: "done"`, never queued).
It appears in the `/backtest` history next to automation runs, opens in the
same `?run=` workspace with a "Manual" label and a risk-per-trade input row,
and replays through the recorded tape (order place/move/cancel/fill and
stop/TP events) in the standard replay player.

Unit tests for every fill rule: `src/lib/backtest/manual-sim.test.ts`.

## Keyboard focus and the spacebar

The chart canvas cannot take keyboard focus, so a toolbar button stays focused
after it is clicked — through drawing, selecting and deleting. Space then
re-triggers that button instead of reaching the session's play/pause shortcut,
which reads as "the drawing tool selected itself and I can't resume".

Chart controls therefore drop focus after a MOUSE click (`event.detail > 0`;
keyboard activation reports 0 and keeps its focus so tab navigation still
works). The replay speed menu does the same thing via `onCloseAutoFocus`. Any
new control added over the chart needs the same treatment.
