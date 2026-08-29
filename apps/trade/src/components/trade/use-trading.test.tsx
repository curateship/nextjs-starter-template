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
  closeLivePositions: vi.fn(),
  closeAllPaperPositions: vi.fn(),
  flattenWalletApi: vi.fn(),
  moveGridRange: vi.fn(),
  reconcileLiveSmartOrders: vi.fn(),
  showErrorToast: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

vi.mock("@/lib/api/trade/live", () => ({
  cancelLiveOrder: vi.fn(),
  changeLiveLeverage: vi.fn(),
  changeLiveMargin: vi.fn(),
  closeLivePosition: vi.fn(),
  closeLivePositions: api.closeLivePositions,
  getLiveErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Live order refused",
  hideLiveTrade: vi.fn(),
  loadOlderLiveTrades: vi.fn(),
  loadLiveTrading: api.loadLiveTrading,
  moveLiveOrder: vi.fn(),
  placeLiveOrder: api.placeLiveOrder,
  setLiveBrackets: vi.fn(),
}))

vi.mock("@/lib/api/trade/paper", () => ({
  cancelPaperOrder: vi.fn(),
  closeAllPaperPositions: api.closeAllPaperPositions,
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

vi.mock("@/lib/api/trade/smart-orders", () => ({
  cancelAllSmartOrders: vi.fn(),
  cancelGridLevel: vi.fn(),
  cancelGridRest: vi.fn(),
  cancelLadderRest: vi.fn(),
  cancelLadderRung: vi.fn(),
  cancelWatch: vi.fn(),
  closePartOfPosition: vi.fn(),
  editWatch: vi.fn(),
  flattenWalletApi: api.flattenWalletApi,
  getSmartOrderErrorMessage: (error: unknown) =>
    error instanceof Error && error.message === "SMART_GRID_FINISHED"
      ? "That grid has already finished, so nothing was changed."
      : error instanceof Error
        ? error.message
        : "Smart order refused",
  moveGridExit: vi.fn(),
  moveGridRange: api.moveGridRange,
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
  api.closeLivePositions.mockReset().mockResolvedValue({
    closed: 0,
    refused: [],
  })
  api.closeAllPaperPositions.mockReset().mockResolvedValue({ closed: 0 })
  api.flattenWalletApi.mockReset().mockResolvedValue({
    stood: [],
    cancelRefused: [],
    selling: [],
    sellRefused: [],
  })
  api.moveGridRange.mockReset()
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

  it("turns into the real order the moment the answer names it", async () => {
    api.placeLiveOrder.mockResolvedValue({
      outcome: {
        status: "resting",
        orderId: "exchange-7",
        avgPx: null,
        filledSz: null,
        protection: null,
        protectionNote: null,
      },
    })

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
      await Promise.resolve()
      await Promise.resolve()
    })

    // The row now IS the order: the exchange's own id, no "sending" label,
    // and the live flag so a drag or a × takes the real road at once.
    expect(latest?.placing).toHaveLength(1)
    expect(latest?.placing[0].id).toBe("exchange-7")
    expect(latest?.placing[0].placing).toBeUndefined()
    expect(latest?.placing[0].live).toBe(true)
  })

  it("hands over to a position when the order filled straight away", async () => {
    api.placeLiveOrder.mockResolvedValue({
      outcome: {
        status: "filled",
        orderId: null,
        avgPx: 0.1,
        filledSz: 10,
        protection: null,
        protectionNote: null,
      },
    })

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
      await Promise.resolve()
      await Promise.resolve()
    })

    // The answer said "filled at 0.1 for 10", so the position is painted
    // from it in the same render the "sending" line leaves — no gap, and no
    // waiting on the next full read for the Entry line.
    expect(latest?.placing).toHaveLength(0)
    expect(latest?.positions).toHaveLength(1)
    expect(latest?.positions[0].szi).toBe(10)
    expect(latest?.positions[0].entryPx).toBe(0.1)
    expect(latest?.positions[0].live).toBeDefined()
  })

  it("paints nothing for a reduce-only fill", async () => {
    api.placeLiveOrder.mockResolvedValue({
      outcome: {
        status: "filled",
        orderId: null,
        avgPx: 0.1,
        filledSz: 10,
        protection: null,
        protectionNote: null,
      },
    })

    await act(async () => root.render(<Harness />))
    await act(async () => {
      latest?.place({
        marketKey: "hyperliquid:mainnet:ENA",
        side: "sell",
        px: 0.1,
        sz: 10,
        leverage: 1,
        reduceOnly: true,
        tpPx: null,
        slPx: null,
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    // A reduce-only fill shrank a position rather than opening one.
    expect(latest?.positions).toHaveLength(0)
  })
})

describe("bulk safety actions", () => {
  it("sends twenty live Close all positions in one capped request", async () => {
    const positions = Array.from({ length: 20 }, (_, index) => ({
      id: `position-${index}`,
      walletId: wallet.id,
      marketKey: `hyperliquid:mainnet:COIN${index}`,
      szi: 1,
      entryPx: 100,
      leverage: 1,
      maxLeverage: 50,
      targets: [],
      tpPx: null,
      feesPaid: 0,
      updatedAt: Date.now(),
      live: {
        marginUsed: 100,
        liquidationPx: null,
        tpOrderId: null,
        slOrderId: null,
      },
    }))
    api.loadLiveTrading.mockResolvedValue({
      ...emptyLiveAnswer,
      positions,
    })
    api.closeLivePositions.mockResolvedValue({ closed: 20, refused: [] })

    await finishFirstRead()
    await act(async () => {
      await latest?.closeAll()
    })

    expect(api.closeLivePositions).toHaveBeenCalledOnce()
    expect(api.closeLivePositions).toHaveBeenCalledWith(
      positions.map(({ walletId, marketKey }) => ({ walletId, marketKey }))
    )
  })

  it("sends Empty wallet as one capped request", async () => {
    await finishFirstRead()

    await act(async () => {
      await latest?.flattenWallet(wallet.id)
    })

    expect(api.flattenWalletApi).toHaveBeenCalledOnce()
    expect(api.flattenWalletApi).toHaveBeenCalledWith({ walletId: wallet.id })
  })
})

describe("a grid edit that finishes before it saves", () => {
  it("shows why the range did not move", async () => {
    api.moveGridRange.mockRejectedValue(new Error("SMART_GRID_FINISHED"))
    await finishFirstRead()

    await act(async () => {
      await latest?.moveGridRange(wallet.id, "grid-1", {
        topPx: 120,
        bottomPx: 80,
      })
    })

    expect(api.showErrorToast).toHaveBeenCalledWith(
      "That grid has already finished, so nothing was changed."
    )
  })
})
