import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listWalletsWithCredentials: vi.fn(),
  loadLivePortfolio: vi.fn(),
  listActiveSmartOrdersIfChanged: vi.fn(),
}))

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler:
        <TData, TResult>(
          fn: (input: {
            data: TData
            context: { user: { id: string } }
          }) => TResult
        ) =>
        (input: { data: TData }) =>
          fn({ ...input, context: { user: { id: "account" } } }),
    }
    return builder
  },
}))
vi.mock("@/server/guards", () => ({ userGet: {}, userPost: {} }))
vi.mock("@/server/trade/wallets", () => ({
  findWallet: vi.fn(),
  listWallets: vi.fn(),
  listWalletsWithCredentials: mocks.listWalletsWithCredentials,
}))
vi.mock("@/server/trade/live-orders", () => ({
  cancelLiveOrder: vi.fn(),
  changeLiveLeverage: vi.fn(),
  changeLiveMargin: vi.fn(),
  closeLivePosition: vi.fn(),
  journalOverride: vi.fn(),
  liveWallet: vi.fn(),
  loadLivePortfolio: mocks.loadLivePortfolio,
  moveLiveOrder: vi.fn(),
  placeLiveOrder: vi.fn(),
  refuseWhatTheWalletCannotPayFor: vi.fn(),
}))
vi.mock("@/server/trade/smart-orders", () => ({
  listActiveSmartOrdersIfChanged: mocks.listActiveSmartOrdersIfChanged,
  placeWatchOrder: vi.fn(),
}))
vi.mock("@/server/protocols/registry", () => ({
  getProtocol: vi.fn(),
  ordersOf: vi.fn(),
}))
vi.mock("@/server/trade/live-fills", () => ({
  hideLiveTrade: vi.fn(),
  loadLiveHistoryBefore: vi.fn(),
}))
vi.mock("@/server/trade/close-live-positions", () => ({
  closeLivePositions: vi.fn(),
}))
vi.mock("@/server/trade/prefs", () => ({ loadOrderStyle: vi.fn() }))
vi.mock("@/server/trade/order-rate-limit", () => ({
  runLiveOrderAction: vi.fn(),
}))
vi.mock("@/server/trade/hand-brackets", () => ({
  setBracketsByHand: vi.fn(),
}))

import { loadLiveTrading } from "./live"

describe("the live trading read", () => {
  beforeEach(() => {
    mocks.listWalletsWithCredentials.mockReset().mockResolvedValue({
      wallets: [
        {
          id: "wallet-1",
          kind: "live",
          protocol: "hyperliquid",
          label: "Live",
        },
      ],
      credentials: new Map(),
    })
    mocks.loadLivePortfolio.mockReset()
    mocks.listActiveSmartOrdersIfChanged.mockReset()
  })

  it("reads watched orders before positions so a fill cannot leave both absent", async () => {
    let finishSmart!: (value: { smartOrders: []; stamp: string }) => void
    const smart = new Promise<{ smartOrders: []; stamp: string }>((resolve) => {
      finishSmart = resolve
    })
    mocks.listActiveSmartOrdersIfChanged.mockReturnValue(smart)
    mocks.loadLivePortfolio.mockResolvedValue({
      positions: [],
      orders: [],
      fills: [],
      trades: [],
      nextBefore: null,
      journalUnchanged: false,
      journalStamp: "journal-1",
      refusals: [],
      unreachable: [],
    })

    const reading = loadLiveTrading()
    await vi.waitFor(() =>
      expect(mocks.listActiveSmartOrdersIfChanged).toHaveBeenCalledOnce()
    )
    expect(mocks.loadLivePortfolio).not.toHaveBeenCalled()

    finishSmart({ smartOrders: [], stamp: "smart-1" })
    await reading

    expect(mocks.loadLivePortfolio).toHaveBeenCalledOnce()
  })
})
