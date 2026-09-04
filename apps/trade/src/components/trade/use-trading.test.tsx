// @vitest-environment jsdom

import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const api = vi.hoisted(() => ({
  loadLiveTrading: vi.fn(),
  loadOlderLiveTrades: vi.fn(),
  loadPaperPortfolio: vi.fn(),
  loadOlderPaperTrades: vi.fn(),
  placeLiveOrder: vi.fn(),
  closeLivePosition: vi.fn(),
  closeLivePositions: vi.fn(),
  closeAllPaperPositions: vi.fn(),
  hideLiveTrade: vi.fn(),
  hidePaperTrade: vi.fn(),
  flattenWalletApi: vi.fn(),
  cancelLadderRest: vi.fn(),
  editWatch: vi.fn(),
  moveGridRange: vi.fn(),
  reconcileLiveSmartOrders: vi.fn(),
  showErrorToast: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: api.toastSuccess } }))

vi.mock("@/lib/api/trade/live", () => ({
  cancelLiveOrder: vi.fn(),
  changeLiveLeverage: vi.fn(),
  changeLiveMargin: vi.fn(),
  closeLivePosition: api.closeLivePosition,
  closeLivePositions: api.closeLivePositions,
  getLiveErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Live order refused",
  hideLiveTrade: api.hideLiveTrade,
  loadOlderLiveTrades: api.loadOlderLiveTrades,
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
  hidePaperTrade: api.hidePaperTrade,
  loadOlderPaperTrades: api.loadOlderPaperTrades,
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
  cancelLadderRest: api.cancelLadderRest,
  cancelLadderRung: vi.fn(),
  cancelWatch: vi.fn(),
  closePartOfPosition: vi.fn(),
  editWatch: api.editWatch,
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
import { baseStopDetection } from "@/lib/trade/dca"
import type { SmartGrid } from "@/lib/trade/smart-plan"
import { readWatchPlan } from "@/lib/trade/watch-order"
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
  api.loadOlderLiveTrades.mockReset()
  api.loadOlderPaperTrades.mockReset()
  api.placeLiveOrder.mockReset()
  api.closeLivePosition.mockReset().mockResolvedValue(undefined)
  api.closeLivePositions.mockReset().mockResolvedValue({
    closed: 0,
    refused: [],
  })
  api.closeAllPaperPositions.mockReset().mockResolvedValue({ closed: 0 })
  api.hideLiveTrade.mockReset().mockResolvedValue(undefined)
  api.hidePaperTrade.mockReset().mockResolvedValue(undefined)
  api.flattenWalletApi.mockReset().mockResolvedValue({
    stood: [],
    cancelRefused: [],
    selling: [],
    sellRefused: [],
  })
  api.cancelLadderRest.mockReset()
  api.editWatch.mockReset().mockResolvedValue({ saved: true })
  api.moveGridRange.mockReset()
  api.reconcileLiveSmartOrders.mockReset().mockResolvedValue(undefined)
  api.showErrorToast.mockReset()
  api.toastSuccess.mockReset()
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

function stalePaperFill() {
  return {
    fillId: "old-sol-fill",
    orderId: "old-sol-order",
    walletId: "paper-wallet",
    marketKey: "hyperliquid:mainnet:SOL",
    side: "buy" as const,
    px: 145,
    sz: 1,
    at: Date.now() - 18 * 24 * 60 * 60 * 1_000,
    closedPnl: 0,
    fee: 0,
    dir: "",
    liquidation: false,
    live: false,
  }
}

function stalePaperHistory(fill: ReturnType<typeof stalePaperFill>) {
  return {
    id: "unpaired:paper-wallet:SOL:old-sol-fill",
    walletId: fill.walletId,
    marketKey: fill.marketKey,
    live: false,
    fills: [fill],
  }
}

describe("removing stale fill history", () => {
  it("takes every arrow off the chart before the save finishes", async () => {
    const fill = stalePaperFill()
    api.loadPaperPortfolio.mockResolvedValue({
      ...emptyPaperAnswer,
      fills: [fill],
    })
    let finishSave!: () => void
    api.hidePaperTrade.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        })
    )

    await finishFirstRead()
    expect(latest?.fills).toEqual([fill])

    let removal!: Promise<void>
    await act(async () => {
      removal = latest!.hideTrades([stalePaperHistory(fill)])
      await Promise.resolve()
    })

    expect(latest?.fills).toEqual([])
    expect(api.hidePaperTrade).toHaveBeenCalledWith([fill.fillId])

    await act(async () => {
      finishSave()
      await removal
    })
  })

  it("puts the arrows back when the save is refused", async () => {
    const fill = stalePaperFill()
    api.loadPaperPortfolio.mockResolvedValue({
      ...emptyPaperAnswer,
      fills: [fill],
    })
    api.hidePaperTrade.mockRejectedValue(
      new Error("History could not be saved")
    )

    await finishFirstRead()

    await act(async () => {
      await latest!.hideTrades([stalePaperHistory(fill)])
    })

    expect(latest?.fills).toEqual([fill])
    expect(api.showErrorToast).toHaveBeenCalledWith(
      "History could not be saved"
    )
  })
})

describe("loading older Journal history", () => {
  it("keeps unmatched exchange fills visible without mixing them into current fills", async () => {
    const fill = {
      ...stalePaperFill(),
      fillId: "older-live-fill",
      walletId: wallet.id,
      live: true,
    }
    api.loadLiveTrading.mockResolvedValue({
      ...emptyLiveAnswer,
      nextBefore: 2_000,
    })
    api.loadOlderLiveTrades.mockResolvedValue({
      fills: [fill],
      trades: [],
      nextBefore: null,
    })

    await finishFirstRead()
    await act(async () => {
      await latest!.loadOlderTrades()
    })

    expect(latest?.journalFills).toEqual([fill])
    expect(latest?.fills).toEqual([])
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

/** A real position on one coin, the shape the account read hands back. */
function livePosition(marketKey: string) {
  return {
    id: `position:${marketKey}`,
    walletId: wallet.id,
    marketKey,
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
  }
}

/** A buying grid on one coin, holding coins on rung 1 or holding nothing. */
function gridOn(marketKey: string, holding: boolean): SmartGrid {
  return {
    id: `grid:${marketKey}`,
    walletId: wallet.id,
    marketKey,
    status: "active",
    flowRunId: null,
    createdAt: 1,
    updatedAt: 1,
    kind: "grid",
    plan: {
      handSetAt: null,
      direction: "long",
      topPx: 110,
      bottomPx: 90,
      takeProfitPx: null,
      spacing: "even",
      sizing: "even",
      manualSizing: false,
      manualRungPcts: null,
      potPct: 20,
      maxOrderVolPct: 0,
      startedAt: 1,
      sizeDecimals: 4,
      priceTick: null,
      minOrderValueUsd: 10,
      leverage: 1,
      maxLeverage: 20,
      levels: [
        {
          buyPx: 100,
          sellPx: 110,
          sz: holding ? 1 : 0,
          budget: 100,
          heldSz: holding ? 1 : 0,
          status: holding ? "holding" : "waiting",
          armed: true,
          dead: false,
          cycles: 0,
        },
        {
          buyPx: 90,
          sellPx: 100,
          sz: 0,
          budget: 100,
          heldSz: 0,
          status: "waiting",
          armed: true,
          dead: false,
          cycles: 0,
        },
      ],
      carriedLevels: [],
      stopLoss: { mode: "fixed", underPct: 5, px: 80, base: null },
      baseDetection: baseStopDetection(),
      baseWatch: null,
      aimedSlPx: null,
      pairedStop: null,
      seenFillsTo: 0,
      cycles: 0,
      follow: false,
      followDown: false,
      entered: true,
      shifts: 0,
      downShifts: 0,
      closedReason: null,
      reverseWhenStopped: false,
      reversedFrom: null,
      reverseFailReason: null,
    },
  }
}

describe("closing a position a grid is holding", () => {
  // Tyler, 4 Sep 2026: the grid sat on the chart for a few seconds after its
  // position was closed, with its held rung and a stop that could no longer
  // price, until the engine noticed the position was gone. It goes on the
  // press now, the way the position's own row does.
  const coin = "hyperliquid:mainnet:AZTEC"

  it("takes the grid off the chart the moment Close is pressed", async () => {
    api.loadLiveTrading.mockResolvedValue({
      ...emptyLiveAnswer,
      positions: [livePosition(coin)],
      smartOrders: [gridOn(coin, true)],
    })
    await finishFirstRead()
    expect(latest?.grids).toHaveLength(1)

    await act(async () => {
      await latest?.close(livePosition(coin))
    })
    expect(api.closeLivePosition).toHaveBeenCalledWith(wallet.id, coin)
    // The read after the close still carries the grid, the engine not having
    // ended it yet, and the grid stays hidden all the same.
    expect(latest?.grids).toHaveLength(0)
  })

  it("puts the grid back when the exchange refuses the close", async () => {
    api.loadLiveTrading.mockResolvedValue({
      ...emptyLiveAnswer,
      positions: [livePosition(coin)],
      smartOrders: [gridOn(coin, true)],
    })
    api.closeLivePosition.mockRejectedValue(new Error("Venue busy"))
    await finishFirstRead()

    await act(async () => {
      await latest?.close(livePosition(coin))
    })
    expect(api.showErrorToast).toHaveBeenCalledWith("Venue busy")
    expect(latest?.grids).toHaveLength(1)
  })

  it("leaves a grid holding nothing where it is", async () => {
    // Flat with levels waiting is a grid's ordinary state, and the position
    // being closed was never its coins.
    api.loadLiveTrading.mockResolvedValue({
      ...emptyLiveAnswer,
      positions: [livePosition(coin)],
      smartOrders: [gridOn(coin, false)],
    })
    await finishFirstRead()

    await act(async () => {
      await latest?.close(livePosition(coin))
    })
    expect(latest?.grids).toHaveLength(1)
  })

  it("takes the grids off with Close all too", async () => {
    const other = "hyperliquid:mainnet:CRV"
    api.loadLiveTrading.mockResolvedValue({
      ...emptyLiveAnswer,
      positions: [livePosition(coin), livePosition(other)],
      smartOrders: [gridOn(coin, true), gridOn(other, false)],
    })
    api.closeLivePositions.mockResolvedValue({ closed: 2, refused: [] })
    await finishFirstRead()

    await act(async () => {
      await latest?.closeAll()
    })
    expect(latest?.grids.map((one) => one.marketKey)).toEqual([other])
  })

  it("puts the grids back when Close all is refused", async () => {
    api.loadLiveTrading.mockResolvedValue({
      ...emptyLiveAnswer,
      positions: [livePosition(coin)],
      smartOrders: [gridOn(coin, true)],
    })
    api.closeLivePositions.mockRejectedValue(new Error("Venue busy"))
    await finishFirstRead()

    await act(async () => {
      await latest?.closeAll()
    })
    expect(api.showErrorToast).toHaveBeenCalledWith("Venue busy")
    expect(latest?.grids).toHaveLength(1)
  })
})

describe("removing a DCA ladder", () => {
  it("stays quiet when the ladder held no position", async () => {
    api.cancelLadderRest.mockResolvedValue({
      cancelled: 2,
      hasPosition: false,
    })
    await finishFirstRead()

    await act(async () => {
      await latest?.cancelLadder(wallet.id, "ladder-1")
    })

    expect(api.cancelLadderRest).toHaveBeenCalledWith({
      walletId: wallet.id,
      ladderId: "ladder-1",
    })
    expect(api.toastSuccess).not.toHaveBeenCalled()
  })

  it("says the bought coins remain when a position is open", async () => {
    api.cancelLadderRest.mockResolvedValue({
      cancelled: 1,
      hasPosition: true,
    })
    await finishFirstRead()

    await act(async () => {
      await latest?.cancelLadder(wallet.id, "ladder-1")
    })

    expect(api.toastSuccess).toHaveBeenCalledWith(
      "Ladder stopped in Main — what's bought stays."
    )
  })
})

describe("a grid edit that finishes before it saves", () => {
  it("shows why the range did not move", async () => {
    api.moveGridRange.mockRejectedValue(new Error("SMART_GRID_FINISHED"))
    await finishFirstRead()

    await act(async () => {
      await latest?.moveGridRange(wallet.id, "grid-1", {
        end: "top",
        px: 120,
      })
    })

    expect(api.moveGridRange).toHaveBeenCalledWith({
      walletId: wallet.id,
      gridId: "grid-1",
      end: "top",
      px: 120,
    })
    expect(api.showErrorToast).toHaveBeenCalledWith(
      "That grid has already finished, so nothing was changed."
    )
  })
})

describe("editing a watched order", () => {
  it("shows the saved values when the window is reopened before the next read", async () => {
    const plan = readWatchPlan({
      triggerPx: 95,
      triggerDirection: "down",
      side: "buy",
      sz: 1,
      leverage: 1,
      maxLeverage: 50,
      sizeDecimals: 3,
      tpPx: null,
      slPx: 88,
      phase: "waiting",
    })
    if (!plan) throw new Error("expected a watched-order plan")
    api.loadLiveTrading.mockResolvedValue({
      ...emptyLiveAnswer,
      smartOrders: [
        {
          id: "watch-1",
          walletId: wallet.id,
          marketKey: "hyperliquid:mainnet:BTC",
          kind: "watch",
          status: "active",
          flowRunId: null,
          createdAt: 1,
          updatedAt: 1,
          plan,
        },
      ],
    })
    await finishFirstRead()

    await act(async () => {
      await latest?.editOrder(wallet.id, "watch-1", {
        sz: 2,
        leverage: 3,
        tpPx: 110,
        slPx: 85,
      })
    })

    expect(api.editWatch).toHaveBeenCalledWith({
      walletId: wallet.id,
      ladderId: "watch-1",
      sz: 2,
      leverage: 3,
      tpPx: 110,
      slPx: 85,
    })
    expect(latest?.watchOrders[0]).toMatchObject({
      sz: 2,
      leverage: 3,
      tpPx: 110,
      slPx: 85,
    })
  })
})
