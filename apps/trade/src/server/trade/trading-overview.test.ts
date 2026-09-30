import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  listWalletsWithCredentials,
  loadWalletSummaries,
  loadPaperPortfolio,
  loadLivePortfolio,
  marksForKeys,
  listActiveSmartOrders,
} = vi.hoisted(() => ({
  listWalletsWithCredentials: vi.fn(),
  loadWalletSummaries: vi.fn(),
  loadPaperPortfolio: vi.fn(),
  loadLivePortfolio: vi.fn(),
  marksForKeys: vi.fn(),
  listActiveSmartOrders: vi.fn(),
}))

vi.mock("@/server/trade/wallets", () => ({
  listWalletsWithCredentials,
  loadWalletSummaries,
}))
vi.mock("@/server/trade/paper", () => ({
  loadPaperPortfolio,
  marksForKeys,
}))
vi.mock("@/server/trade/live-orders", () => ({ loadLivePortfolio }))
vi.mock("@/server/trade/smart-orders", () => ({ listActiveSmartOrders }))
vi.mock("@/server/db", () => ({ db: {} }))
// A grid stamp is a database read of its own. The fills are handed in already
// stamped, which is what that read would have returned.
vi.mock("@/server/trade/grid-fills", () => ({
  stampGridFills: (
    _userId: string,
    _walletIds: readonly string[],
    fills: unknown[]
  ) => Promise.resolve(fills),
}))

const { loadActiveTradesSnapshot, priceFills } =
  await import("@/server/trade/trading-overview")

describe("the Active Trades header read", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listWalletsWithCredentials.mockResolvedValue({
      wallets: [],
      credentials: new Map(),
    })
    loadPaperPortfolio.mockResolvedValue({ positions: [] })
    loadLivePortfolio.mockResolvedValue({ positions: [], unreachable: [] })
    marksForKeys.mockResolvedValue(new Map())
    listActiveSmartOrders.mockResolvedValue([])
  })

  it("reads positions without waiting for unused account balances", async () => {
    await expect(loadActiveTradesSnapshot("person-1")).resolves.toMatchObject({
      activeTrades: [],
      activeTradesUnavailable: [],
      watchingOrders: [],
    })

    expect(listWalletsWithCredentials).toHaveBeenCalledWith("person-1")
    expect(loadWalletSummaries).not.toHaveBeenCalled()
    expect(loadLivePortfolio).toHaveBeenCalledWith("person-1", [], {
      credentials: new Map(),
    })
  })
})

describe("what a fill made", () => {
  const wallets = [{ id: "w1", protocol: "hyperliquid" as const }]
  const fill = (over: Record<string, unknown>) => ({
    fillId: "f",
    orderId: "o",
    walletId: "w1",
    marketKey: "hyperliquid:mainnet:BTC",
    side: "buy" as const,
    px: 1,
    sz: 100,
    at: 0,
    closedPnl: 0,
    fee: 0,
    dir: "Open Long",
    liquidation: false,
    ...over,
  })

  it("charges a grid's entry fee once, on the sale that closes the rung", async () => {
    // The rung's round trip is priced after BOTH fees, so charging the entry
    // fee on the buy as well took it off twice: the USELESS run of 29 Sep 2026
    // read $18.34 down here and $17.80 down in the Journal.
    const money = await priceFills("person-1", wallets, [
      fill({
        fillId: "in",
        orderId: "in",
        side: "buy",
        px: 1,
        fee: 0.4,
        grid: true,
        gridDirection: "long",
      }),
      fill({
        fillId: "out",
        orderId: "out",
        side: "sell",
        px: 1.1,
        at: 60_000,
        fee: 0.6,
        dir: "Close Long",
        closedPnl: 10,
        grid: true,
        gridDirection: "long",
      }),
    ] as never)

    expect(money.get("in")).toBe(0)
    // $10 made on the coins, less the $0.40 in and the $0.60 out.
    expect(money.get("out")).toBeCloseTo(9, 10)
  })

  it("still charges a hand-placed buy its own fee", async () => {
    const money = await priceFills("person-1", wallets, [
      fill({ fillId: "in", orderId: "in", side: "buy", fee: 0.4 }),
    ] as never)

    expect(money.get("in")).toBeCloseTo(-0.4, 10)
  })
})
