# The protocol layer

- Screens draw `MarketRow`s from `src/lib/protocols/contracts.ts` — never an
  exchange's raw response. A market is identified by protocol + network + id.
- Everything Hyperliquid is in `src/server/protocols/hyperliquid/`, the only
  folder allowed to import its SDK. `fence.test.ts` fails the suite if it
  leaks, or if shared code ever asks `=== "hyperliquid"`.
- Adding an exchange is a new folder plus one entry in
  `src/server/protocols/registry.ts`, followed by its own dashboard. The
  current Trade dashboard remains Hyperliquid-only.

## Pushed fill capability

An exchange registers `orders.watchFills` when it can tell Trade that an
execution happened without waiting for the next account poll. Aster,
Hyperliquid, KuCoin, Lighter and Phemex register that capability. Solana has no
private exchange socket and keeps using its read path.

- Hyperliquid, Aster and Phemex hand complete fill rows to Trade from the
  private connection.
- KuCoin's socket hands over the execution id. Its connector then reads that
  one row from `/api/v1/recentFills`, because the socket message has no fee or
  closed-position money.
- Lighter uses its account change message to ask for a fill-history recovery.

Every pushed row and every recovery row goes through
`src/server/trade/live-fills.ts`. The database primary key removes duplicates
before a notice is sent. `orders.fillsNeedRecovery` keeps the REST safety net
active at startup, after a connection gap and on the venue's periodic
reconciliation schedule.

Two things the old Trading app had that this does not, on purpose:

- **No separate account panel.** The wallet in use belongs beside the chart
  controls because every order drawn on that chart goes to that wallet. Wallet
  management opens from the same control without taking chart space.
- **No order book or trades tape panels.**
