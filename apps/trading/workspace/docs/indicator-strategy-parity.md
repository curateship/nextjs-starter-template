# Indicator ↔ Strategy Parity Rule

**One indicator, one set of settings, everywhere.** Strategy signals come from
indicators, so an indicator must look and behave identically in every place it
appears:

- the trade chart and its indicator settings modal
- the automation canvas nodes
- the Strategies page editor
- the backtest / quick test chart
- the live bot worker

If an indicator's settings change shape (new period, new toggle, new
parameter), the strategy that derives from it changes with it — they share the
same settings. Never add a capability to only one side.

The only exceptions are strategies that are explicitly NOT indicator-based
(e.g. DCA ladders). Everything else derives from an indicator.

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
- **Chart seeds strategy.** New strategy/automation nodes start as an exact
  copy of the chart indicator's saved settings via a `<name>ParamsFromChart()`
  function in the indicator's def file (see `priceActionParamsFromChart`,
  `emaCrossParamsFromChart`), wired into the Strategies loader
  (`src/lib/api/strategies.ts`) and the automation route loader
  (`src/routes/_authenticated/automations/$automationId.tsx`).
- **Strategy paints in chart shape.** An indicator module's `paint.indicators`
  must emit the SAME config shape the chart's own overlay uses (EMA Cross
  emits one `type: "ema"` config with all three lines), so a strategy on the
  backtest chart draws exactly what the trade chart draws.
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
5. Update/add the `ParamsFromChart` seeding.
6. Check old saved params still parse to identical behavior (zod defaults).
7. Run the parity tests (`src/lib/indicators/parity.test.ts`) and the full
   suite.
