// @vitest-environment jsdom

import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const api = vi.hoisted(() => ({
  loadLiveTrading: vi.fn(),
  loadPaperPortfolio: vi.fn(),
  placeLiveOrder: vi.fn(),
  reconcileLiveSmartOrders: vi.fn(),
  showErrorToast: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

vi.mock("@/lib/api/live", () => ({
  cancelLiveOrder: vi.fn(),
  changeLiveLeverage: vi.fn(),
  changeLiveMargin: vi.fn(),
  closeLivePosition: vi.fn(),
  getLiveErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Live order refused",
  hideLiveTrade: vi.fn(),
  loadOlderLiveTrades: vi.fn(),
  loadLiveTrading: api.loadLiveTrading,
  moveLiveOrder: vi.fn(),
  placeLiveOrder: api.placeLiveOrder,
  setLiveBrackets: vi.fn(),
}))

vi.mock("@/lib/api/paper", () => ({
  cancelPaperOrder: vi.fn(),
  closeAllPaperPositions: vi.fn(),
  closePaperPosition: vi.fn(),
  flipPaperPosition: vi.fn(),
  getPaperErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Practice order refused",
  hidePaperTrade: vi.fn(),
  loadOlderPaperTrades: vi.fn(),
  loadPaperPortfolio: api.loadPaperPortfolio,
  movePaperOrder: vi.fn(),
  placePaperOrder: vi.fn(),
  setPaperBrackets: vi.fn(),
  updatePaperOrder: vi.fn(),
}))

vi.mock("@/lib/api/smart-orders", () => ({
  cancelAllSmartOrders: vi.fn(),
  cancelGridLevel: vi.fn(),
  cancelGridRest: vi.fn(),
  cancelLadderRest: vi.fn(),
  cancelLadderRung: vi.fn(),
  cancelWatch: vi.fn(),
  closePartOfPosition: vi.fn(),
  editWatch: vi.fn(),
  flattenWalletApi: vi.fn(),
  getSmartOrderErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Smart order refused",
  moveGridExit: vi.fn(),
  moveGridRange: vi.fn(),
  moveWatch: vi.fn(),
  placeDcaLadder: vi.fn(),
  placeGridOrder: vi.fn(),
  reconcileLiveSmartOrders: api.reconcileLiveSmartOrders,
  reshapeGrid: vi.fn(),
  resumeSmartOrder: vi.fn(),
  setGridFollow: vi.fn(),
  updateGridStop: vi.fn(),
  updateLadderExits: vi.fn(),
}))

vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: api.showErrorToast,
}))

import { useTrading, type Trading } from "@/components/trade/use-trading"
import type { TradeWallet } from "@/lib/trade/wallets"

const wallet: TradeWallet = {
  id: "wallet-1",
  label: "Main",
  kind: "live",
  status: "active",
  protocol: "hyperliquid",
  network: "mainnet",
  startingBalance: 1_000,
  address: "0x1",
  hasKey: true,
  keyValidUntil: null,
}

const emptyPaperAnswer = {
  positions: [],
  orders: [],
  fills: [],
  trades: [],
  nextBefore: null,
  journalUnchanged: false,
  journalStamp: "paper-journal",
  smartOrders: [],
  smartOrdersStamp: "paper-smart",
  wallets: [],
}

const emptyLiveAnswer = {
  positions: [],
  orders: [],
  fills: [],
  trades: [],
  nextBefore: null,
  journalUnchanged: false,
  journalStamp: "live-journal",
  smartOrders: [],
  smartOrdersStamp: "live-smart",
  wallets: [{ id: wallet.id, label: wallet.label }],
  refusals: [],
  unreachable: [],
}

let latest: Trading | null = null
let root: Root
let host: HTMLDivElement

function rememberTrading(value: Trading) {
  latest = value
}

function Harness() {
  const trading = useTrading(wallet, "hyperliquid")
  useEffect(() => rememberTrading(trading), [trading])
  return null
}

beforeEach(() => {
  vi.useFakeTimers()
  latest = null
  api.loadPaperPortfolio.mockReset().mockResolvedValue(emptyPaperAnswer)
  api.loadLiveTrading.mockReset().mockResolvedValue(emptyLiveAnswer)
  api.placeLiveOrder.mockReset()
  api.reconcileLiveSmartOrders.mockReset().mockResolvedValue(undefined)
  api.showErrorToast.mockReset()
  host = document.createElement("div")
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
})

async function finishFirstRead() {
  await act(async () => root.render(<Harness />))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
  })
}

describe("the first portfolio read", () => {
  it("ends the loading state when the live half refuses", async () => {
    api.loadLiveTrading.mockRejectedValue(new Error("offline"))

    await finishFirstRead()

    expect(latest?.settled).toBe(true)
    expect(latest?.failed).toBe(true)
    expect(latest?.loading).toBe(false)
  })
})

describe("the line for an order being sent", () => {
  it("disappears as soon as the exchange refuses the order", async () => {
    let refuse!: (error: Error) => void
    api.placeLiveOrder.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject
        })
    )

    await act(async () => root.render(<Harness />))
    await act(async () => {
      latest?.place({
        marketKey: "hyperliquid:mainnet:ENA",
        side: "buy",
        px: 0.1,
        sz: 10,
        leverage: 1,
        reduceOnly: false,
        tpPx: null,
        slPx: null,
      })
    })

    expect(latest?.placing).toHaveLength(1)

    await act(async () => {
      refuse(new Error("The order must be worth at least $10."))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(api.showErrorToast).toHaveBeenCalledWith(
      "The order must be worth at least $10."
    )
    expect(latest?.placing).toHaveLength(0)
  })
})
