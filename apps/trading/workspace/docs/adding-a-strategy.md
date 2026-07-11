# Adding a new strategy (or indicator)

The strategy system is two plug-in layers. Nothing else in the app is edited
when you add to either layer — every screen (editor, pickers, dashboards,
backtest workspace, routes) reads the registries.

## Layer 1: strategy kinds (engines)

A "kind" is a whole trading engine: `signal` (indicator-driven) and `dca`
(the ladder) exist today. Adding one costs **two files + two one-line
registrations**:

1. **The card** — `src/lib/strategies/kinds/<kind>.ts`, filling out
   `StrategyKindModule` (see `kinds/contract.ts`): its config zod schema
   (must include `v: 2` and `kind: z.literal("<kind>")`), label,
   plain-English description, default config, editor `paramFields` with
   `params`/`setParam` accessors, one-line `summary`, results-page
   `inputRows`, `warmupBars`, and the `takeProfitPct` bound for the
   backtest's credibility tripwire. Cards are pure data/functions — no React,
   importable from client, server, and worker.
2. **Register the card** — one line in `src/lib/strategies/kinds/registry.ts`.
   Order rule: `signal` stays LAST in the list (its `kind` is defaulted so it
   must only catch configs no other kind claimed, including legacy kind-less
   configs).
3. **The engine** — `worker/src/engine/<kind>-strategy.ts`, implementing the
   worker `Strategy` contract (`worker/src/strategies/contract.ts`):
   `warmup`, `init`, `desiredOrders`, and optionally `onCandleClose` /
   `onTick` / `onFill` / `exitTriggers`. Study `dca-strategy.ts` (stateful,
   resting limit orders) and `signal-strategy.ts` (indicator + trade
   manager) as the two reference shapes.
4. **Register the engine** — one line in the `ENGINES` table in
   `worker/src/strategies/registry.ts`.

Plus one type line: add the new config type to the `StrategyConfig` union in
`src/lib/strategies/strategy-config.ts`.

Then write a backtest unit test beside `worker/src/engine/dca-backtest.test.ts`
that pins the engine's fill mechanics through the real runner.

What you do NOT touch: any component, route, API schema, or server file.

Notes:
- Bots currently accept only `kind === "signal"` (server gate in
  `src/server/bots.ts` + the bots CHECK constraint). New kinds are
  backtest-only until that's deliberately opened up.
- The chart paints indicator overlays only for the signal kind; other kinds
  show trade chips from fills, which need no per-kind code.

## Layer 2: indicators (inside the signal kind)

Adding an indicator is unchanged and even cheaper: one module in
`src/lib/indicators/defs/` implementing `IndicatorModule` (label,
description, params schema + fields, `warmupBars`, pure/causal `compute`
that returns paint + buy/sell signals), plus one line in
`src/lib/indicators/registry.ts`. The chart, editor, live engine, and
backtester pick it up automatically.
