# Automation canvas — how the nodes work

Plain-English reference for the Automation canvas semantics. The engine code
lives in `src/lib/automations/` (compile + resolve) and is shared verbatim by
the live worker and the backtester.

## Adding a node

`node-registry.ts` is the single catalog for node names, palette groups,
defaults, descriptions, icon choices, settings-panel choices, output ports,
attachment hooks, and allowed connections. The palette, editor, canvas,
compiler, and favorites all read from that catalog instead of maintaining
their own node lists and switches.

A new node normally changes the registry, its saved shape/compiler handling,
and its runtime or settings component when it needs custom behavior. Tests and
this document still change deliberately. A node that reuses an existing saved
shape and settings panel can be registered without editing the surrounding
canvas files.

## Node types

- **Indicator** — computes signals from candles. Three outputs:
  - **Bullish / Bearish** (edges): the indicator's one-candle buy/sell
    signals. Connect only to actions.
  - **Trend** (middle): chains into another indicator (or a Look Back /
    Timeframe) as a filter. The downstream trigger only fires when this
    indicator's most recent signal side agrees with the trigger's direction.
    The latch is same-candle inclusive and holds until the opposite signal.
- **Look Back** (filter) — sits on a Trend wire and puts an expiry on the
  signal flowing through it: the latched signal only counts for N candles
  after it fires (the signal candle is bar 1), then goes stale and blocks
  downstream until a fresh signal. The cap applies to the whole branch that
  feeds through it; nested Look Backs keep the strictest cap. It cannot wire
  directly into an action (that would re-fire the action on every candle in
  the window).
- **Timeframe** (filter) — sits on a Trend wire, like Look Back, and moves
  everything upstream of it onto ONE higher timeframe — the classic "only
  take 15m entries while the 4h trend is bullish" is
  `EMA → Timeframe (4h) → entry indicator`. Every indicator feeding through
  it evaluates on closed candles of that timeframe, and its opinion takes
  effect one bot-timeframe candle after the big candle closes — never
  before. At most one distinct higher timeframe per graph, it can only
  output to an indicator (never straight to an action or QFL), and it cannot
  share a signal path with a Look Back (v1). The same indicator may fire
  entries on the bot timeframe AND gate through a Timeframe node — the
  engine simply computes it on both clocks. Only gating the SAME entry on
  two clocks at once (reaching it both through the Timeframe node and around
  it) is rejected as ambiguous. Full rules and the no-lookahead design:
  `higher-timeframe-filter.md`.
- **Market Scanner** (scanner) — checks whether markets already chosen in the
  bot or Backtest meet a daily-volume floor and, optionally, have enough price
  history. It never chooses, adds, removes, or replaces markets. Its
  **Markets** output connects to QFL.
- **Whale Wall** (scanner) — reads the live order book and follows the closest
  qualifying wall on each side. **Bid Wall** connects to Long and **Ask Wall**
  connects to Short. Its minimum dollar size, size compared with nearby
  levels, maximum market distance, and confirmation time are editable. A wall
  can represent several anonymous orders; it does not identify a wallet.
- **QFL** — a long-only Quickfingers Luc strategy. It detects a fast,
  high-volume fall through a confirmed base and owns a fixed ladder of buys.
  Every buy is anchored to that first base, can fill once, and has its own
  profit order. An optional Trend input only controls whether a new ladder may
  start; it does not cancel one already in progress. Markets come from the
  existing bot and Backtest market pickers.
- **Action (Long / Short / Close Position)** — targets a % of account equity
  (Close is full reduce-only). Multiple wires into one action mean "any of
  them fires it". The **Then** output is visual-flow only: it chains an
  action onward to its exit watcher (e.g. Long → EMA → Close) and compiles
  to nothing.
- **Take Profit / Stop Loss** — protective exits hung on a Long or Short
  entry's hooks; each guards only the side it's attached to. The Stop Loss
  node has a **Stop behavior** setting: **Fixed** (default — the stop stays
  its percent from the entry) or **Trailing** (the stop follows the best
  price seen since entry at that percent distance and only ever moves in the
  trade's favor — a pullback of that size from the best price exits).
  Trailing can optionally wait until the trade is up a set percent before it
  starts to follow; until then it waits at the fixed distance. Live ticks and
  backtests share the same trade-manager math, and the backtest fills the
  trailing exit at the exact ratcheted stop price via the honest intrabar
  pause path (adverse extreme first, so a same-bar stop-out beats a same-bar
  ratchet). The bot chart draws the live stop as a dashed red "Trailing stop"
  line (not draggable — the ratchet owns it), and the backtest chart draws
  each trade's stop path the same way. If the worker is down, the trail stops
  moving: the stop stays protective at its last level but goes stale until
  the worker returns.

  A second setting, **Stop sits at**, chooses what the stop measures against:
  **A percent from the entry** (default, everything above) or **The session
  open**. The session one puts the stop at the price the picked session opened
  at — below the entry on a long, above it on a short, because that is where
  the level lies. It learns *which* session from a **Sessions node wired into
  it** (Trend output → the stop's hook), so the signal and the stop can never
  drift onto different sessions, and compile refuses it without that wire. It
  cannot also trail (one fixed price is not a moving one) and cannot hang off a
  QFL/DCA ladder, whose whole premise is buying down through levels. The
  percent stays beside it as the fallback for a trade opened outside the
  session's hours — there is always a stop. The price is read once when the
  position opens and held until it closes, so the stop never wanders onto the
  next session mid-trade.

  The Take Profit node has the matching setting, **Take profit measured as**:
  **A percent from the entry** (default) or an **R&R ratio** — a multiple of
  whatever the stop turned out to be. At 1:1 a 2% stop banks at 2%; at 2:1 it
  banks at 4%. It works with every entry node and every kind of stop, because
  it measures the stop rather than caring how the stop was set. Against a plain
  percent stop the target is worked out when the automation compiles, so every
  engine just sees an ordinary percent; against a session-open stop the
  distance only exists once the trade opens, so the ratio is applied then. A
  ratio needs a Stop Loss on the same entry, and compile says so if it is
  missing.
- **AND/OR (legacy)** — removed. Old drafts still load but must delete the
  node; running bots keep their frozen snapshots working.

## Node palette

- **Fav** and **All nodes** use the standard rounded segmented tab control. Its
  background spans the palette, while each tab stays content-width.
- **Fav** contains the nodes favorited in the current workspace. Select a node
  in **All nodes**, then use the always-visible star in the upper-right of its
  settings to add or remove it. Favorites cover every node type and follow the
  workspace across devices.
- **All nodes** contains every registered Automation node. The Indicators
  dashboard no longer controls which indicator nodes appear or which settings
  a new node receives. New indicator nodes start from their Automation defaults.
- Search stays at the bottom of the palette while the node list scrolls and
  filters whichever tab is open. Select a card to preview it, or drag/use `+`
  to add it to the canvas.

## Visualize mode

- A **Visualize** button floats over the canvas's top-right corner (July 17,
  2026) and swaps the center canvas for a live price chart; a **Canvas**
  button in the same top-right spot of the chart header swaps back. The
  palette and inspector stay put in both modes.
- The chart shows a picked mainnet market (saved per browser, default BTC) at
  the automation's interval, with the compiled automation's indicator paint —
  exactly what the backtest chart would draw. While the graph has validation
  issues, the chart still renders but shows a "fix issues" notice instead of
  indicator paint.
- Settings that map to a price level render as dashed lines, and dragging a
  dashed line rewrites that node's setting exactly like typing it in the
  inspector (the graph goes dirty; Save persists):
  - **Take Profit / Stop Loss** — drawn ±pct from the latest closed candle's
    close, marked by a gray "Entry (now)" guide line. Dropping a line sets the
    node's pct (clamped: TP 0.1–1000, SL 0.1–95, rounded to 2 decimals).
  - **QFL** — the amber "QFL buy 1" line sits `crackPct` below the current
    confirmed base and is draggable (clamped 0.1–50); the rest of the buy
    ladder paints as faint non-draggable dotted lines from `qflDeviations`.
- Lines anchor to the last CLOSED candle so they don't wobble on every tick.
- Implementation: `automation-visualize-panel.tsx`; drag→setting math is the
  pure `nodeAfterLineDrag` (unit-tested in `automation-visualize.test.ts`).

## Rules the compiler enforces

- Trend → indicator, Look Back, Timeframe, or QFL. The Sessions node's Trend
  may also reach a **Stop Loss**, which is how a session-anchored stop learns
  its session; no other indicator can. Look Back → indicator or
  QFL. Timeframe → indicator only, needs a Trend input, and must be strictly
  higher than the automation's timeframe.
- Market Scanner Markets → QFL only. QFL accepts at most one Market Scanner.
- Bullish/Bearish → action only. Then → indicator only.
- Bid Wall → Long only. Ask Wall → Short only. A Whale Wall automation cannot
  also contain a candle-driven Long, Short, or Reverse entry. Candle-driven
  Close actions and attached Take Profit / Stop Loss nodes remain available.
- Look Back needs a Trend input and whole-number bars 1–1400. The cap plus
  its indicator's warm-up must also fit the engine's 1400-candle evaluation
  window (`AUTOMATION_MAX_WINDOW_BARS`) — compile rejects it otherwise, so a
  too-large Look Back errors instead of silently never trading.
- QFL is the only entry owner in its Automation, so it cannot be combined with
  Long, Short, Reverse, or Whale Wall entry paths. Candle-based Close rules are
  allowed.
- No cycles; every node must reach an action or QFL. A Market Scanner must
  reach QFL.

## The three editor modes: Canvas · Backtest · Bot

The toolbar's centered pill switches the whole editor between three views of
the same automation: **Canvas** (edit the nodes), **Backtest** (run it on
history), and **Bot** (run it live). Backtest and Bot are the same
setup→run→results flow — one historical, one live — and both use the same
"Previous run"/name-to-keep save-override lifecycle. Bot mode's market
selector, live dashboard, canvas-linked config, and run history are described
in `bots.md` ("The run model"). Deep links: `?view=backtest` / `?view=bot`.

## Backtesting (the only way to run one)

- The **Backtest** tab in the editor toolbar is the single backtest entry
  point for the whole app — and it is a **mode of the editor**, not a modal
  (the launch dialog was removed; Quick Test and the old New Run dialog
  before it). Selecting it swaps the editor's panels in place; the Canvas tab
  restores them. Backtest mode, Bot mode, and Visualize are mutually
  exclusive — entering one exits the others.
- Panel roles while the mode is on: the **right panel** is the setup form
  (markets + days back), then live per-market progress, then the market list
  of results (net %, win rate; failed rows flagged with the reason). The
  **left panel** shows the run's parameters plus the selected market's
  headline numbers (`automation-backtest-side-panel.tsx`,
  `automation-backtest-params-panel.tsx`, state in
  `use-automation-backtest.ts`).
- Clicking a market swaps the **center** to that market's results chart
  (shared `backtest-run-chart.tsx` — the same component the `/backtest?run=`
  page uses) and fills the **bottom panel** (the activity log's slot) with
  its trades; clicking a trade focuses the chart on it. The Canvas tab
  returns to the nodes without losing the run.
- The run chart can **replay** the run: the engine records a per-bar tape
  (pending limit orders like the QFL ladder, stop/TP levels, strategy
  events — `timeline` column, loaded lazily), and the transport bar plays it
  back with play/pause, step, speed, and a scrubber. While replaying, candles
  and marks past the playhead are hidden.
- The run chart's **Indicators menu is fixed to the canvas**: it lists
  exactly what the automation's own nodes draw, with the run's saved
  settings — show/hide only, nothing can be added or edited there (that's
  what the canvas is for). One row per node, plus synthetic rows for candle
  coloring and the trailing-stop path. Hidden picks persist per browser,
  keyed by node id. The recorded order/stop lines from the tape always stay.
- **Tune by dragging**: the recorded Stop/TP lines (and QFL's first ladder
  line) are draggable on the replay chart. A drop rewrites the matching
  node's setting — the rule, never that one order — marks the graph dirty,
  and the results panel offers one-click **Save & re-run**.
- **Run lifecycle (DB-backed)**: an unnamed run is auto-named
  `Previous run · <automation> · <markets> · <window>` and is *replaceable* —
  the automation's next backtest deletes it server-side
  (`deleteReplaceableAutomationRuns`; named or pinned groups are never
  touched). The results panel has a "Name this run to keep it" field
  (`renameBacktestGroup`) that promotes it to a permanent keeper. Opening
  backtest mode rehydrates the automation's latest group from the DB
  (`loadLatestAutomationBacktest`), so results survive leaving the editor or
  the browser.
- Everything else — timeframe, compiled strategy, **fees, slippage, and
  starting capital** — comes from the Automation itself. Fees + capital are
  per-Automation settings ("Backtest defaults"), set in the create dialog and
  both settings dialogs, stored in the draft JSONB next to `protection`. The
  server reads them from the saved row; the client cannot override them, so
  every run of an Automation is cost-comparable.
- Exiting the mode (or closing the tab) never stops runs — the server queue
  keeps draining, and every run still lands in the backtest history pages
  (`/backtest`), which remain the permanent record. There is no
  auto-navigation on completion; results appear in the editor. The standalone
  `/backtest?run=` page stays for opening historical runs and now links back
  via "Open automation" in its header.
- Bots are created from Automations only (the template source was removed).
- Whale Wall automations cannot use historical Backtest because candles do not
  contain past order books. The editor explains this beside the disabled
  Backtest action, and the server rejects direct attempts too. Paper and live
  bots remain available.
- Multi-market QFL bots reserve the entire planned ladder before buying. The
  shared QFL exposure limit applies across every market runner. If simultaneous
  signals do not all fit, QFL ranks them by past base recovery, crack-volume
  strength, daily volume, then market name for a stable tie-break.

## QFL sizing, recovery, and exits

- The default ladder has five buys. Prices sit 2.5%, 4%, 5.5%, 7%, and 8.5%
  below the frozen base. The saved spacing growth can change that curve.
- Size grows geometrically by the saved multiplier. The percentages are
  normalized so the complete ladder equals the saved per-market exposure.
  Base, equity, prices, and sizes stay frozen for the whole cycle.
- Each filled buy takes profit at its own fill price plus the saved profit
  percentage, never above the saved ceiling below the broken base. Optional
  stop and time exits close the whole remaining position.
- Base respect starts with the first cracked confirmed base in a decline.
  Lower bases before recovery remain part of that same test. A signed recovery
  target below, at, or above the first base decides whether the test passed.
  Unresolved tests fail, and zero historical tests cannot pass the optional
  filter.
- The saved respect window is loaded for candidate ranking even when the strict
  filter is off. Markets without the full window remain eligible but rank below
  markets with a complete score.
- QFL loads and caches the required long history before using the optional
  recovery-quality filter or Market Scanner history check. If history is
  unavailable or incomplete, the check stays blocked instead of treating
  missing data as proof.
- Bot creation rejects market, timeframe, and history combinations that would
  retain more than one million QFL history candles in one worker. Use fewer
  markets, less history, or a coarser timeframe when that limit is reached.
- Multi-market QFL waits for every active market to finish the same candle
  before ranking cracks and reserving shared exposure.
- After a worker restart, QFL cancels its old resting ladder orders before
  rebuilding them. It stops if the saved filled size does not match the live
  position, preventing an uncertain position from being bought twice.

## Runtime behavior worth knowing

- Hammer / Shooting Star from Price Action confirm 2 candles after the
  pattern candle, so entries land 3 candles after the pattern by design.
- Close wins ties over entries on the same candle; Long+Short matching on
  the same candle places nothing and emits a warning.
- The backtester and the live worker run the same `evaluateAutomation`, so a
  backtest of an automation is the real logic, not a reimplementation.
- Whale Wall must see the same price level continuously for its confirmation
  time before resting a post-only order one valid price step toward the spread.
  It never crosses the spread. Two qualifying connected sides block a new
  entry until only one remains.
- If the wall weakens, moves, disappears, or book data goes stale, the resting
  entry is cancelled. Any partial fill is treated as an owned position; the
  remainder is cancelled and the position is closed reduce-only if its wall
  becomes invalid. An owned position is also closed after five seconds without
  fresh book data.
- A wall bot starts only when that market is flat. On restart it cancels its
  own stale orders and either revalidates its saved wall or closes its owned
  position. After a completed trade, the exact wall must disappear or change
  before another trade can start.
