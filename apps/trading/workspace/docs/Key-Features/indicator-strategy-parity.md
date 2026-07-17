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
- **Signal arrows are the exception, not the rule.** Chips mark real fills;
  indicator paint is lines/zones/bar-colors. Three pinned indicators ALSO
  paint their signals as native chart arrows (green up = long, red down =
  short), each computed through its own module so the chart marks exactly
  what the strategy trades: QQE, the EMA overlay's cross of its two fastest
  switched-on lines, and Price Action's detected patterns (EMA and Price
  Action added July 17, 2026 by request). Don't add arrows to other
  indicators without an explicit ask — one signal is not a trade.
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
