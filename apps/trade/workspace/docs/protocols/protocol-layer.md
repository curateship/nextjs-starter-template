# The protocol layer

- Screens draw `MarketRow`s from `src/lib/protocols/contracts.ts` — never an
  exchange's raw response. A market is identified by protocol + network + id.
- Everything Hyperliquid is in `src/server/protocols/hyperliquid/`, the only
  folder allowed to import its SDK. `fence.test.ts` fails the suite if it
  leaks, or if shared code ever asks `=== "hyperliquid"`.
- Something only one exchange can do is an optional slot on its registry
  entry, and shared code asks for the slot, never for the exchange. Three
  are Hyperliquid's today: `orders.postOnlyRefused` (the refusal a resting
  order is sent again for), `markets.forgetPrice` (drop a cached price a
  refusal proved stale) and `orders.recoverClientOrder` (find an order by its
  client id after its answer was lost).
- A chain folder never reads or writes the app's own tables. BNB Chain's and
  Robinhood Chain's ledgers sit one level up, in `bnb-ledger.ts` and
  `robinhood-ledger.ts`, for that reason.
- Adding an exchange is a new folder plus one entry in
  `src/server/protocols/registry.ts`, followed by its own dashboard. The
  current Trade dashboard remains Hyperliquid-only.

## Chains that share code

BNB Chain and Robinhood Chain are both Ethereum-shaped chains, so they share
`src/server/protocols/evm-chain/`: the wallet, the request counters, the
refusal sentences, KyberSwap, the receipt reader, the balance read, the swap
and the market list. The request counters keep one allowance per outside
service host, shared by every chain. Each chain folder hands the shared code its own addresses, coins and
explorer as settings. The shared folder names no chain and no address, and
`fence.test.ts` fails if it does. `robinhood-chain.md` has the details.

## Pushed fill capability

An exchange registers `orders.watchFills` when it can tell Trade that an
execution happened without waiting for the next account poll. ApeX Omni,
Aster, Binance, edgeX, Hyperliquid, KuCoin, Lighter and Phemex register that
capability. Solana has no
private exchange socket and keeps using its read path.

- Hyperliquid, Aster, Binance, Phemex and ApeX Omni hand complete fill rows
  to Trade from the private connection. ApeX's rows carry the fee but no profit, which
  ApeX states only per whole close.
- KuCoin's socket hands over the execution id. Its connector then reads that
  one row from `/api/v1/recentFills`, because the socket message has no fee or
  closed-position money.
- Lighter uses its account change message to ask for a fill-history recovery.

ApeX Omni lives in `src/server/protocols/apex/` and
`src/lib/protocols/apex/`, and nowhere else may name an ApeX address or load
its vendored zkLink signer. `apex-omni.md` has the details.

edgeX lives in `src/server/protocols/edgex/` and `src/lib/protocols/edgex/`,
and `fence.test.ts` fails if an edgeX address appears anywhere else. Its fills
arrive pushed; one whose profit the push leaves out is read back from edgeX's
fill page before it becomes a row. `edgex.md` has the details.

Binance lives in `src/server/protocols/binance/` and
`src/lib/protocols/binance/`, and `fence.test.ts` fails if a Binance address
appears anywhere else. `binance.md` has the details.

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
