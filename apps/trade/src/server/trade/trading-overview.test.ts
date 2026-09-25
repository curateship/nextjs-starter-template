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

const { loadActiveTradesSnapshot } =
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
