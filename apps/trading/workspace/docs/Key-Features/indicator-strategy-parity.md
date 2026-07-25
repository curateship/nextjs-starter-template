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
  request), and Base — one long per formed base (added July 24, 2026 by request;
  the chart card carries the same Formed within % the strategy node has). Fair
  Value Gap deliberately stays arrow-less — its boxes are the visual. One signal
  is still not a trade.

### Base forms bases. It does NOT break them.

The Base indicator signals ONE thing: a base has formed. Breaking a base (price
cracking below it) is the **DCA node's** rule and lives there — the ladder tracks
bases itself in `worker/src/engine/dca-automation.ts` with the helpers in
`lib/automations/qfl.ts`, and never reads the Base indicator's signals. Never put
a crack/break trigger back into the indicator: both events are *buys*, so on a
chart they draw two identical green up arrows with no way to tell them apart,
which is exactly why this was split (July 24, 2026, by request).

The crack settings (Crack %, Maximum fall, the respect filter) still ride on the
Base indicator's params, because the DCA node reads its base detection from the
Base node wired into it. They are grouped in the inspector under "Base break (DCA
node)" so it's clear they are not the indicator's own signal, and they are NOT on
the trade chart's Base card, which only paints base forming.

Timing detail worth keeping: a base confirms `pumpPeriods` bars AFTER its low, and
by then price has usually bounced well clear of it — on ETH daily, all 7
confirmations in the last 500 days closed 11–20% above their base. So the formed
long does not print on the confirming candle. It waits for the first candle whose
close is within `formedWithinPct` (default 1%) of the base level, prints once, and
skips that base afterwards, so the arrow always sits AT the base.

That wait is bounded by `formedValidBars` (default 40): if price hasn't come back
within that many candles of the confirmation, the base goes stale and never prints,
so an old base can't fire a signal long after it stopped mattering. The default
comes from measurement — on ETH 1h and 1d, genuine returns to a base land 0–35
candles after confirmation, while the stale cases sat 110+ candles out.

`formedRequireRising` (default ON) is the last gate, and it compares SIGNALS, not
candles: a mark is only drawn when it sits above the PREVIOUS mark, so a staircase
of lower and lower bases draws nothing and only a rising sequence shows arrows.
Skipped marks are still computed and remain the yardstick the next mark is measured
against — so a mark can be drawn while sitting below an older, higher one, as long
as it beats the mark immediately before it. The first mark in the series has nothing
to compare against and always stands. (Candle colour is NOT part of this: an
earlier attempt gated on "two green candles" and was wrong — a run of green candles
can still step downhill, so it left marks mid-fall.)
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
