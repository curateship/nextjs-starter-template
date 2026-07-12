# Automation canvas — how the nodes work

Plain-English reference for the Automation canvas semantics. The engine code
lives in `src/lib/automations/` (compile + resolve) and is shared verbatim by
the live worker and the backtester.

## Node types

- **Indicator** — computes signals from candles. Three outputs:
  - **Bullish / Bearish** (edges): the indicator's one-candle buy/sell
    signals. Connect only to actions.
  - **Trend** (middle): chains into another indicator (or a Look Back) as a
    filter. The downstream trigger only fires when this indicator's most
    recent signal side agrees with the trigger's direction. The latch is
    same-candle inclusive and holds until the opposite signal.
- **Look Back** (filter) — sits on a Trend wire and puts an expiry on the
  signal flowing through it: the latched signal only counts for N candles
  after it fires (the signal candle is bar 1), then goes stale and blocks
  downstream until a fresh signal. The cap applies to the whole branch that
  feeds through it; nested Look Backs keep the strictest cap. It cannot wire
  directly into an action (that would re-fire the action on every candle in
  the window).
- **Action (Long / Short / Close Position)** — targets a % of account equity
  (Close is full reduce-only). Multiple wires into one action mean "any of
  them fires it". The **Then** output is visual-flow only: it chains an
  action onward to its exit watcher (e.g. Long → EMA → Close) and compiles
  to nothing.
- **AND/OR (legacy)** — removed. Old drafts still load but must delete the
  node; running bots keep their frozen snapshots working.

## Rules the compiler enforces

- Trend → indicator or Look Back. Look Back → indicator only.
- Bullish/Bearish → action only. Then → indicator only.
- Look Back needs a Trend input and whole-number bars 1–1400. The cap plus
  its indicator's warm-up must also fit the engine's 1400-candle evaluation
  window (`AUTOMATION_MAX_WINDOW_BARS`) — compile rejects it otherwise, so a
  too-large Look Back errors instead of silently never trading.
- No cycles; every node must reach an action.

## Backtesting (the only way to run one)

- The **Backtest** button in the editor toolbar is the single backtest entry
  point for the whole app (Quick Test and the old New Run dialog were
  removed). It opens a minimal modal: pick one-to-many markets and how many
  days, press Test.
- Everything else — timeframe, compiled strategy, **fees, slippage, and
  starting capital** — comes from the Automation itself. Fees + capital are
  per-Automation settings ("Backtest defaults"), set in the create dialog and
  both settings dialogs, stored in the draft JSONB next to `protection`. The
  server reads them from the saved row; the client cannot override them, so
  every run of an Automation is cost-comparable.
- The modal shows per-market progress and can be closed — runs continue in
  the server queue. When every market finishes it opens the result page
  (`/backtest?run=<group>`). Re-running = pressing Backtest again (each run
  is a fresh immutable group).
- Bots are created from Automations only (the template source was removed).

## Runtime behavior worth knowing

- Hammer / Shooting Star from Price Action confirm 2 candles after the
  pattern candle, so entries land 3 candles after the pattern by design.
- Close wins ties over entries on the same candle; Long+Short matching on
  the same candle places nothing and emits a warning.
- The backtester and the live worker run the same `evaluateAutomation`, so a
  backtest of an automation is the real logic, not a reimplementation.
