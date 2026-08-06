# Architecture overview

How the Trade app is put together, and why a second exchange will be cheap to
add. The shell's own architecture — layout, navigation, accounts, roles,
billing — is `docs/architecture-overview.md`; this file only covers what Trade
adds on top of it.

## What Trade is

Trade is a copy of Custom Shell being rebuilt into a trading app one section at
a time. Two rules from that model shape everything here:

- **Shell files are never edited.** Shell improvements arrive later by merging
  the shell in, and an edited shell file conflicts on every merge, forever.
  Everything Trade adds lives in files Trade created.
- **The old Trading app is a behaviour reference, not a source.** Its code
  wired one exchange into every screen — roughly two thousand lines of drift —
  which is exactly what this rebuild exists to avoid. Nothing is copied from
  it.

## The map

What Trade has added to the shell, and what each piece is for:

| Where | What |
| --- | --- |
| `src/routes/_authenticated/trade.tsx` | The page. Loads the market list, carries the picked market in the address. |
| `src/components/trade/` | The workspace and its panels. Draw only — no exchange code, no database. |
| `src/lib/trade/` | Small app helpers: panel-layout keys, number formatting. |
| `src/lib/protocols/contracts.ts` | The shapes screens and exchanges agree on. Browser-safe. |
| `src/lib/api/markets.ts` | The guarded endpoints: the market list, and saved stars. |
| `src/server/protocols/` | The exchange side: the registry, and one folder per exchange. |
| `src/server/trade/` | Trade's own tables and the code that touches them. |
| `drizzle/0100_…` | Trade's own migrations, numbered from 0100. |
| `workspace/docs/ui-ux.md` | The approved look and behaviour of every screen. |
| `workspace/tasks/Platform/` | The task files, where decisions are recorded. |

## The protocol layer

The one idea: **screens never know which exchange they are talking to.**

- A screen draws `MarketRow`s — plain numbers with a key — and reads labels
  like "Hyperliquid" off the data. It never imports an exchange package and
  never asks `which protocol is this?`.
- Everything Hyperliquid lives in `src/server/protocols/hyperliquid/`. Its SDK,
  its endpoints, its response checking and its quirks stop at that folder's
  edge.
- `src/server/protocols/registry.ts` is the lookup: protocol id in, adapters
  out. It has one entry today.
- **The rule is a test, not a hope.** `src/server/protocols/fence.test.ts`
  fails the suite if the exchange package is imported anywhere else, or if
  shared code compares against a protocol id.

How the market list flows, end to end:

```
route loader → loadMarkets() (guarded) → registry → hyperliquid/markets.ts
   → exchange API → response checked → translated to MarketRow[]
   → the panel draws rows, labels and all
```

**Adding a second exchange** is: one new folder under `src/server/protocols/`
that produces the same shapes, one new entry in the registry, and its id added
to the union in `contracts.ts`. No screen changes. If a screen has to change,
something leaked and the fence test should have caught it.

## Saved data

- **A saved market is protocol + network + id in one key** —
  `hyperliquid:mainnet:BTC` — never a bare symbol, because BTC exists on every
  exchange. One builder and one parser in `contracts.ts`; a key that does not
  parse or is not listed resolves to "not available", never to a different
  market.
- **Trade's tables are declared in `src/server/trade/schema.ts`**, not in the
  shell's schema file. One table so far: `trade_market_favorites`, one row per
  person, holding their starred market keys — server-side so stars follow the
  account, not the browser.
- **Trade's migrations are numbered from 0100.** The shell keeps adding its own
  under 00xx and the runner applies the folder in filename order, so the gap
  means a shell merge can never collide with an app migration or run after one
  it should have preceded.

## Deliberately not built yet

- **Live streaming prices.** The list is fetched on page load. Reconnects and
  stale-data handling come as their own piece.
- **Accounts, orders, positions.** Those panels are empty states. The account
  and order adapters get designed with the panels that need them — a contract
  written before its consumer is a guess.
- **Alerts**, which is what the market list's Watch tab is waiting for.
- **The Canvas and the Backtest stay outside this app's exchange boundary.**
  The Canvas will hand an automation to the Backtest or to a Bot tab through a
  door, not run either itself — decided in
  `workspace/tasks/Platform/canvas-hands-off-to-backtest-and-bot.md`.

## Where decisions live

The task files under `workspace/tasks/Platform/` are the record: what was
decided, when, and why, including the decisions made mid-build. The screen
rules live in `workspace/docs/ui-ux.md`. When this file and a task file
disagree, the task file is newer — fix this one.
