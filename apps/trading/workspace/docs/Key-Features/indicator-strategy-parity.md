# Indicator ↔ Strategy Parity Rule

**One indicator, one set of settings, everywhere.** Automation signals come
from indicators, so an indicator must look and behave identically in every
place it appears:

- the trade chart and its indicator settings modal
- the automation canvas nodes
- the backtest chart
- the live bot worker

If an indicator's settings change shape (new period, new toggle, new
parameter), the strategy that derives from it changes with it — they share the
same settings. Never add a capability to only one side.

## How the code enforces this

- **One compute path.** Every signal indicator lives in
  `src/lib/indicators/defs/*` and is registered in
  `src/lib/indicators/registry.ts`. The chart paint, the automation evaluator,
  the backtest, and the live worker all call the same `compute()`. Never
  reimplement an indicator for one surface.
- **One settings shape.** The chart overlay config
  (`src/lib/trading/indicators-config.ts` `DEFAULT_INDICATORS`) must carry the
  same parameters as the strategy module's `paramsSchema` (chart stores
  booleans as 0/1). Example: EMA is ONE indicator with `fast/slow/third` +
  `showFast/showSlow/showThird` on both sides — never separate "EMA 20 /
  EMA 50" chart entries next to an "EMA Cross" strategy with different fields.
  Its settings dialog renders one card PER LINE (period, on/off, color); the
  per-line colors are display-only (`colors` map) and never part of the
  strategy's settings.
- **Independent starting settings.** New Automation indicator nodes use the
  defaults from `src/lib/indicators/registry.ts`. Chart pins and saved chart
  settings never control which Automation nodes are available or how a new
  node starts. Existing saved Automation node settings remain unchanged.
- **Automation paints in chart shape.** An indicator module's
  `paint.indicators` must emit the SAME config shape the chart's own overlay
  uses (EMA Cross emits one `type: "ema"` config with all three lines), so an
  automation on the backtest chart draws exactly what the trade chart draws.
- **Signal arrows.** Chips mark real fills; indicator paint is
  lines/zones/bar-colors, and pinned indicators with a signal rule ALSO paint
  their buy/sells as native chart arrows (green up = long, red down = short),
  each computed through its own module so the chart marks exactly what the
  strategy trades. Painting arrows today: QQE, the EMA overlay's cross of its
  two fastest switched-on lines, Price Action's detected patterns, Bollinger
  (per its Mode — the chart card carries the same revert/breakout Mode the
  strategy node has), Trendline Break (all but QQE added July 17, 2026 by
  request), and Base — a long at each confirmed base and a short at each confirmed
  ceiling, either side switchable (added July 24–25, 2026 by request; the chart card
  carries the same settings the strategy node has). Fair
  Value Gap deliberately stays arrow-less — its boxes are the visual. One signal
  is still not a trade.

### Base marks levels. It does NOT break them, and it has NO edge.

The Base indicator marks two things: a **base** (support) confirmed by a low that
held, and a **ceiling** (resistance) confirmed by a high that held. Each side has its
own switch (`formedShowLong` / `formedShowShort`, both default ON) and its own
spacing clock, and both come from one pass over the candles — `baseLevels` and its
mirror `ceilingLevels`.

**Breaking a level is not here.** Price cracking below a base ("the crack") is the
DCA ladder's rule and lives in `worker/src/engine/dca-automation.ts` with helpers in
`lib/automations/dca-ladder.ts`; it never reads this indicator's signals. Never put a
crack/break trigger back in: both events are *buys*, so on a chart they draw two
identical green up arrows with no way to tell them apart (July 24, 2026).

The crack settings (Crack below base %, Maximum fall, the past-base-quality filter)
live on the **DCA node** — moved off this indicator on July 25, 2026, since a node
should own the settings it consumes. The Base node hands the DCA node `basePeriods` /
`pumpPeriods` and nothing else. When adding a setting, put it on the node whose rule
reads it; a parameter parked on a neighbour is how "Base break (DCA node)" ended up
labelled with the name of the node it belonged to.

**The two filters, exactly as shipped** — get these the right way round:

- `formedRequireHigherBase` (default ON): a level is marked only if it beats the level
  **immediately before it on the same side** — higher for a base, lower for a ceiling.
  That is the textbook higher low / lower high, proven identical to it on four real
  datasets. It hides 14 of 25 bases on ALGO 15m, which is why it needs to be visible
  as a switch.
- `formedMinBars` (default 20): two arrows on the same side can never be closer than
  that many candles.

Seven filter designs that were WRONG, all caught on the chart July 24, 2026 — do not
reintroduce any of them. Note especially the third and fourth: they are the two ways
of picking the wrong reference point.

- A proximity rule (`formedWithinPct`) plus a staleness window (`formedValidBars`).
  Duplicated the Price Action indicator's job and printed nothing on real settings.
- Candle colour ("two green candles"). A run of green candles can still step downhill,
  so marks landed mid-fall.
- Comparing the arrows' print prices instead of the level values. A confirming candle
  can close ABOVE the previous mark while its level is BELOW the previous level (real
  case on ETH 1h: levels 1778.8 → 1750.5, closes 1821.0 → 1881.8), which drew arrows
  straight down a staircase.
- Comparing against the last level MARKED (with a reset down to any lower level)
  instead of the level immediately before. Every small bounce in a fall beat the
  skipped level below it, so arrows clustered a few candles apart at one price.
- Splitting the gate into a boolean plus a percent, where the percent did nothing
  while the boolean was off and the UI gave no hint why. Never ship a setting that can
  be silently inert.
- A PERCENT gap at all. ALGO 15m spent ten days inside a 2%-wide band, so any percent
  worth setting marked one level and then nothing. Frequency is governed by
  `basePeriods`, not by this gate.
- An "only higher bases" switch measuring against the HIGHEST level ever marked. The
  default comparison already means "beats the one before", so the switch could only be
  redundant or destructive — it left 1 of 11 arrows.

**Measured result: no edge.** Across 21 Binance markets, walk-forward, real costs, the
short side returned −4.49%/month out-of-sample on 15m and about break-even on 4h/1d;
the long side −4.19%/month on 15m; and random entries with the identical stop beat it
in 5 of 6 cells. Win rate lands exactly on the break-even line at every risk-reward
ratio. Treat Base as a level finder for stops and context, not an entry — and do not
tune its filters expecting that to change. Full numbers and method:
base-indicator.md.

The gate must stay causal: it only reads the last base already drawn, never future
candles. `parity.test.ts` enforces this by replaying every prefix of a 600-candle
series and requiring each prefix's marks to match the full series up to that
candle, so the live bot and the chart cannot disagree.
- **Old saved settings.** When adding a parameter, give it a zod `.default()`
  that preserves the old behavior, and remember editors must display
  schema-PARSED params (see `IndicatorFields` in the automation inspector) so
  saved configs show the defaults that will actually run.

## Checklist when changing an indicator

1. Update the def in `src/lib/indicators/defs/<name>.ts` (schema, defaults,
   paramFields, paint, compute).
2. Update the chart config in `src/lib/trading/indicators-config.ts`
   (DEFAULT_INDICATORS entry, param fields, toggles, display name, palette).
3. Update the chart rendering (`src/components/chart/price-chart.tsx`) and the
   settings modal (`src/components/indicators/indicator-settings-dialog.tsx`).
4. Update server param validation (`src/server/indicators.ts`).
5. Check the registry defaults are correct for a new Automation node.
6. Check old saved params still parse to identical behavior (zod defaults).
7. Run the parity tests (`src/lib/indicators/parity.test.ts`) and the full
   suite.
