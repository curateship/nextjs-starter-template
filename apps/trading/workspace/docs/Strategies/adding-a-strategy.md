# Adding a new strategy kind (or indicator)

The strategy system is two plug-in layers. Nothing else in the app is edited
when you add to either layer — every screen reads the registries.

## Layer 1: strategy kinds (engines)

A "kind" is a whole trading engine. `automation` (the canvas) is the ONLY
kind today — `signal`, `dca`, and `qfl` were all retired in July 2026 (code,
saved rows, and the /strategies pages were deleted; one indicator signal is
not a good enough trade signal on its own, and Automations combine indicators
with protection instead). Adding a kind costs **two files + two one-line
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
3. **The engine** — `worker/src/engine/<kind>-strategy.ts`, implementing the
   worker `Strategy` contract (`worker/src/strategies/contract.ts`):
   `warmup`, `init`, `desiredOrders`, and optionally `onCandleClose` /
   `onTick` / `onFill` / `exitTriggers`. Study `automation-strategy.ts` as
   the reference shape.
4. **Register the engine** — one line in the `ENGINES` table in
   `worker/src/strategies/registry.ts`.

Plus one type line: widen `StrategyConfig` back into a union in
`src/lib/strategies/strategy-config.ts` (and `strategyConfigSchema` back to a
`z.union`).

Then write a backtest unit test in `worker/src/engine/` (see
`automation-strategy.test.ts`) that pins the engine's fill mechanics through
the real runner.

Notes:
- Backtests are launched only from Automations (the Backtest button on the
  canvas). A new kind has no launch surface until it's wired into that flow
  or expressed as Automation nodes — prefer nodes.
- Bots accept only `kind === "automation"` (server gate in
  `src/server/bots.ts` + the bots CHECK constraint).
- Charts never paint indicator buy/sell arrows; chips mark real fills, and
  indicator paint is lines/zones/bar-colors only.
- **Migrations run once, via a ledger.** `scripts/setup-database.mjs` records
  each applied file in a `_migrations` table and skips it forever after
  (added July 12, 2026, after the old replay-everything behavior silently
  deleted automation bots/runs on every dev start via drizzle/0017's
  `<> 'signal'` cleanup). Still write cleanup `delete`s with EXPLICIT retired
  types (never `<> 'current-kind'`): pre-ledger databases replay every file
  one final time on their first ledger run, and the PGlite tests apply files
  directly.

## Layer 2: indicators (the automation building blocks)

Adding an indicator is cheaper: one module in `src/lib/indicators/defs/`
implementing `IndicatorModule` (label, description, params schema + fields,
`warmupBars`, pure/causal `compute` that returns paint + buy/sell signals —
the signals feed the automation evaluator, not chart arrows), plus one line
in `src/lib/indicators/registry.ts`. The chart, automation canvas, live
engine, and backtester pick it up automatically. Follow
`workspace/docs/indicator-strategy-parity.md`.
