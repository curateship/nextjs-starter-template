# The protocol layer

- Screens draw `MarketRow`s from `src/lib/protocols/contracts.ts` — never an
  exchange's raw response. A market is identified by protocol + network + id.
- Everything Hyperliquid is in `src/server/protocols/hyperliquid/`, the only
  folder allowed to import its SDK. `fence.test.ts` fails the suite if it
  leaks, or if shared code ever asks `=== "hyperliquid"`.
- Adding an exchange is a new folder plus one entry in
  `src/server/protocols/registry.ts`, followed by its own dashboard. The
  current Trade dashboard remains Hyperliquid-only.

Two things the old Trading app had that this does not, on purpose:

- **No separate account panel.** The wallet in use belongs beside the chart
  controls because every order drawn on that chart goes to that wallet. Wallet
  management opens from the same control without taking chart space.
- **No order book or trades tape panels.**

