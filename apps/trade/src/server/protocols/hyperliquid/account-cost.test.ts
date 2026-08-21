import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * What reading a Hyperliquid account costs, counted rather than reasoned
 * about.
 *
 * **This file is the "count first, guess never" runbook, written down.**
 * `workspace/docs/hyperliquid-rate-limits.md` records a day lost to guessing
 * which call was spending the allowance, and its closing line is that the
 * arithmetic being reasonable is not the same as it being measured. The app's
 * live counter (`TRADE_COUNT_EXCHANGE_CALLS=true`) needs a real account and a
 * real minute; this needs neither, gives the same figure every time, and fails
 * the build the day a change starts spending more.
 *
 * The weights are Hyperliquid's own, from its rate-limit page: 1,200 weight a
 * minute per machine; `l2Book`, `allMids`, `clearinghouseState`, `orderStatus`,
 * `spotClearinghouseState` and `exchangeStatus` cost 2 each; every other info
 * request costs 20.
 */

/** Hyperliquid's published weight per info request. */
const CHEAP = new Set([
  "l2Book",
  "allMids",
  "clearinghouseState",
  "orderStatus",
  "spotClearinghouseState",
  "exchangeStatus",
])

function weightOf(calls: Map<string, number>): number {
  let total = 0
  for (const [name, count] of calls) total += count * (CHEAP.has(name) ? 2 : 20)
  return total
}

/** Every info call this test's fake exchange was asked for, by name. */
const calls = new Map<string, number>()

function record(name: string) {
  return (...args: unknown[]) => {
    calls.set(name, (calls.get(name) ?? 0) + 1)
    return answers[name](...args)
  }
}

/** What the fake exchange says. One wallet, one position, one resting order. */
const answers: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  userAbstraction: async () => "classic",
  clearinghouseState: async () => ({
    assetPositions: [
      {
        position: {
          coin: "BTC",
          szi: "0.5",
          entryPx: "100000",
          leverage: { value: 5 },
          liquidationPx: "81000",
          marginUsed: "10000",
          unrealizedPnl: "250",
        },
      },
    ],
    marginSummary: { accountValue: "12000", totalMarginUsed: "10000" },
    withdrawable: "2000",
  }),
  spotClearinghouseState: async () => ({ balances: [] }),
  frontendOpenOrders: async () => [
    {
      coin: "ETH",
      side: "B",
      limitPx: "3000",
      sz: "1",
      oid: 21,
      isTrigger: false,
      triggerPx: "0",
      isPositionTpsl: false,
      reduceOnly: false,
      orderType: "Limit",
    },
  ],
  perpDexs: async () => [null],
  allPerpMetas: async () => [{ universe: [{ name: "BTC" }, { name: "ETH" }] }],
}

vi.mock("@/server/protocols/hyperliquid/client", () => ({
  infoClient: () => ({
    userAbstraction: record("userAbstraction"),
    clearinghouseState: record("clearinghouseState"),
    spotClearinghouseState: record("spotClearinghouseState"),
    frontendOpenOrders: record("frontendOpenOrders"),
    perpDexs: record("perpDexs"),
    allPerpMetas: record("allPerpMetas"),
  }),
}))

/**
 * The socket is up and says this wallet uses the main market only — the
 * ordinary case, and the one the app is tuned for. A wallet whose socket is
 * down reads far more, and `orders.test.ts` covers that path.
 */
vi.mock("@/server/protocols/hyperliquid/user-markets", () => ({
  marketsWalletUses: () => [""],
  marketsWalletHasMoneyOn: () => [""],
  walletFeedWarmingUp: () => false,
  dropIdleWalletFeeds: () => {},
}))

/**
 * The order socket, steerable. `pushing` is a wallet whose feed is up and
 * sending; off, every read falls back to asking the exchange, which is what
 * a wallet with no socket does for real.
 */
const socket = vi.hoisted(() => ({ pushing: true }))

vi.mock("@/server/protocols/hyperliquid/open-orders-feed", () => ({
  restingOrdersFromFeed: () =>
    socket.pushing
      ? [
          {
            coin: "ETH",
            side: "B",
            limitPx: "3000",
            sz: "1",
            oid: 21,
            isTrigger: false,
            triggerPx: "0",
            isPositionTpsl: false,
            reduceOnly: false,
            orderType: "Limit",
          },
        ]
      : null,
  distrustOpenOrderFeeds: () => {},
  dropIdleOpenOrderFeeds: () => {},
}))

const { fetchHyperliquidAccount, forgetHyperliquidAccounts } = await import(
  "@/server/protocols/hyperliquid/account"
)
const { fetchHyperliquidPortfolio, forgetHyperliquidPortfolios } = await import(
  "@/server/protocols/hyperliquid/orders"
)

const ADDRESS = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf"

/** The app's own beats, from `use-trading.ts` and `use-trade-account.ts`. */
const PORTFOLIO_POLL_MS = 4_000
const ACCOUNT_POLL_MS = 15_000

/**
 * One minute of a Trade tab left open on one active real wallet: the chart and
 * the bottom panel asking for positions and orders every four seconds, the
 * account card asking for its figures every fifteen. Nothing is placed or
 * cancelled, so no cache is thrown away.
 */
async function oneMinuteOfWatching(addresses: string[]): Promise<void> {
  for (let ms = 0; ms < 60_000; ms += 1_000) {
    if (ms % PORTFOLIO_POLL_MS === 0) {
      for (const address of addresses) {
        await fetchHyperliquidPortfolio("testnet", address)
      }
    }
    if (ms % ACCOUNT_POLL_MS === 0) {
      for (const address of addresses) {
        await fetchHyperliquidAccount("testnet", address)
      }
    }
    vi.advanceTimersByTime(1_000)
  }
}

// Every test starts an hour after the last, so no cache from one can answer
// in another and quietly make a figure look smaller than it is.
let clock = Date.UTC(2026, 7, 21)

beforeEach(() => {
  vi.useFakeTimers()
  clock += 60 * 60_000
  vi.setSystemTime(new Date(clock))
  calls.clear()
  socket.pushing = true
  forgetHyperliquidPortfolios()
  forgetHyperliquidAccounts()
})

/**
 * The market catalogue, warmed and then not counted. It is one pair of calls
 * every ten minutes for the whole app, shared by every wallet, so charging a
 * single minute for all of it would say more about this test than about the
 * app.
 */
async function warmCatalogue(): Promise<void> {
  await fetchHyperliquidPortfolio("testnet", ADDRESS)
  forgetHyperliquidPortfolios()
  calls.clear()
}

describe("what one account read costs", () => {
  it("reads a classic wallet's own figures for 2 weight", async () => {
    await fetchHyperliquidAccount("testnet", ADDRESS)
    // The margin mode costs 20 and is asked for once a minute, not once a
    // read. The spot balances cost 2 and are only read by the modes that use
    // them, which this account is not one of. What is left is one cheap call.
    calls.delete("userAbstraction")
    expect([...calls.keys()]).toEqual(["clearinghouseState"])
    expect(weightOf(calls)).toBe(2)
  })

  it("asks for the margin mode once a minute, not once a read", async () => {
    await fetchHyperliquidAccount("testnet", ADDRESS)
    vi.advanceTimersByTime(30_000)
    await fetchHyperliquidAccount("testnet", ADDRESS)
    expect(calls.get("userAbstraction")).toBe(1)
    vi.advanceTimersByTime(31_000)
    await fetchHyperliquidAccount("testnet", ADDRESS)
    expect(calls.get("userAbstraction")).toBe(2)
  })

  it("reads positions and orders for 2 weight while the socket is up", async () => {
    await warmCatalogue()
    await fetchHyperliquidPortfolio("testnet", ADDRESS)
    // Positions are one cheap call. The orders were the expensive half, at 20
    // weight against the positions' 2, and the socket sends them for nothing.
    expect(calls.get("frontendOpenOrders")).toBeUndefined()
    expect(weightOf(calls)).toBe(2)
  })

  it("asks the exchange for the orders when the socket cannot say", async () => {
    await warmCatalogue()
    socket.pushing = false
    await fetchHyperliquidPortfolio("testnet", ADDRESS)
    expect(calls.get("frontendOpenOrders")).toBe(1)
    expect(weightOf(calls)).toBe(22)
  })

  it("asks once for two wallets pointed at the same account", async () => {
    await warmCatalogue()
    await Promise.all([
      fetchHyperliquidAccount("testnet", ADDRESS),
      fetchHyperliquidAccount("testnet", ADDRESS.toUpperCase()),
      fetchHyperliquidPortfolio("testnet", ADDRESS),
      fetchHyperliquidPortfolio("testnet", ADDRESS.toUpperCase()),
    ])
    // Both caches are keyed on the address, not on the wallet, and the entry
    // goes in before the read is awaited — so the second wallet joins the
    // first one's answer instead of paying for its own.
    expect(calls.get("clearinghouseState")).toBe(2)
    expect(calls.get("userAbstraction")).toBe(1)
  })
})

describe("what a minute of watching one wallet costs", () => {
  it("stays under a fifth of the exchange's allowance", async () => {
    await warmCatalogue()
    await oneMinuteOfWatching([ADDRESS])
    const weight = weightOf(calls)
    // Measured the same way before the cuts and after, and both figures are
    // written into `hyperliquid-rate-limits.md`. Before: 426. After: 58.
    expect(weight).toBe(58)
  })

  it("leaves room for three wallets on three accounts", async () => {
    await warmCatalogue()
    await oneMinuteOfWatching([
      ADDRESS,
      "0x2b5ad5c4795c026514f8317c7a215e218dccd6cf",
      "0x6813eb9362372eef6200f3b1dbc3f819671cba69",
    ])
    // Three separate accounts, watched at the same time, on an exchange that
    // allows 1,200 weight a minute for everything — prices and candles
    // included. Before the cuts this was 1,278, the whole budget and more.
    expect(weightOf(calls)).toBe(174)
  })
})
