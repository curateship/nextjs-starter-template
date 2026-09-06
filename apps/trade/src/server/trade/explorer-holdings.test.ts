import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
  wallets: vi.fn(),
  live: vi.fn(),
  paper: vi.fn(),
}))
vi.mock("./wallets", () => ({ listWalletsWithCredentials: mocks.wallets }))
vi.mock("./live-orders", () => ({ loadLivePortfolio: mocks.live }))
vi.mock("./paper", () => ({ loadPaperPortfolio: mocks.paper }))
import { loadExplorerHoldings } from "./explorer-holdings"
beforeEach(() => {
  vi.clearAllMocks()
  mocks.wallets.mockResolvedValue({
    wallets: [
      { id: "one", label: "One", kind: "live" },
      { id: "two", label: "Two", kind: "live" },
    ],
    credentials: new Map(),
  })
  mocks.paper.mockResolvedValue({ positions: [], orders: [] })
})
it("reads the signed-in account once and drops every mark from a failed wallet", async () => {
  mocks.live.mockResolvedValue({
    positions: [
      { walletId: "one", marketKey: "BTC", szi: 2 },
      { walletId: "two", marketKey: "ETH", szi: 3 },
    ],
    orders: [{ walletId: "one", marketKey: "SOL" }],
    unreachable: ["two"],
  })
  expect(await loadExplorerHoldings("owner")).toEqual({
    marks: [
      { marketKey: "BTC", wallet: "One", size: 2 },
      { marketKey: "SOL", wallet: "One", size: null },
    ],
    failed: 1,
  })
  expect(mocks.wallets).toHaveBeenCalledExactlyOnceWith("owner")
  expect(mocks.live.mock.calls[0][0]).toBe("owner")
})
it("counts failed live reads without discarding a successful paper read", async () => {
  mocks.live.mockRejectedValue(new Error("unavailable"))
  mocks.paper.mockResolvedValue({
    positions: [{ walletId: "paper", marketKey: "BTC", szi: 1 }],
    orders: [],
  })
  expect(await loadExplorerHoldings("owner")).toMatchObject({
    failed: 2,
    marks: [{ marketKey: "BTC", size: 1 }],
  })
})
