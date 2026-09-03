// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ActivityPanel } from "@/components/trade/activity-panel"
import type { Trading } from "@/components/trade/use-trading"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { MarketCatalog, MarketRow } from "@/lib/protocols/contracts"
import type { LiveFill } from "@/lib/trade/live-trades"
import type { TradePosition } from "@/lib/trade/paper"

const marks = vi.hoisted(() => new Map<string, number>())

vi.mock("@/lib/trade/live-market", () => ({
  useLiveMarks: () => marks,
}))

vi.mock("@/components/trade/positions-table", () => ({
  PositionsTable: () => <div>Positions table</div>,
  OpenOrdersTable: () => <div>Open orders table</div>,
  TradesTable: ({
    unmatchedHistory,
  }: {
    unmatchedHistory?: readonly unknown[]
  }) => <div>Journal table {unmatchedHistory?.length ?? 0}</div>,
}))

vi.mock("@/components/trade/close-all-menu", () => ({
  CloseAllMenu: () => null,
}))

vi.mock("@/components/trade/brackets-dialog", () => ({
  BracketsDialog: () => null,
}))

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

const market: MarketRow = {
  key: "hyperliquid:mainnet:BTC",
  marketId: "BTC",
  symbol: "BTC",
  quoteAsset: "USDC",
  subExchange: null,
  category: "crypto",
  sizeDecimals: 3,
  priceTick: null,
  minOrderValueUsd: null,
  maxLeverage: 10,
  isolatedOnly: false,
  iconUrl: null,
  price: 105,
  change24h: null,
  volume24hUsd: 0,
  fundingHourly: null,
  openInterestUsd: null,
}

const position: TradePosition = {
  id: "position-1",
  walletId: "practice",
  marketKey: market.key,
  szi: 2,
  entryPx: 100,
  leverage: 1,
  maxLeverage: 10,
  targets: [],
  tpPx: null,
  slPx: null,
  feesPaid: 0,
  updatedAt: 1,
}

const catalog: MarketCatalog = {
  protocol: "hyperliquid",
  protocolLabel: "Hyperliquid",
  network: "mainnet",
  networkLabel: "Mainnet",
  picker: {
    categories: "crypto-only",
    hip3: false,
    funding: true,
    openInterest: true,
  },
  rows: [market],
}

function trading(positions: TradePosition[]): Trading {
  return {
    positions,
    orders: [],
    watchOrders: [],
    smartOrders: [],
    trades: [],
    fills: [],
    journalFills: [],
    walletNames: new Map([["practice", "Practice"]]),
    settled: true,
    failed: false,
    busy: false,
    retry: vi.fn(),
    close: vi.fn(),
    closePart: vi.fn(),
    closeAll: vi.fn(),
    cancelAllWatchedOrders: vi.fn(),
    cancelAllSmartOrders: vi.fn(),
    hideTrades: vi.fn(),
    setBrackets: vi.fn(),
    flip: vi.fn(),
    setPositionLeverage: vi.fn(),
    adjustPositionMargin: vi.fn(),
    olderTradesBusy: false,
    olderTradesDone: true,
    loadOlderTrades: vi.fn(),
  } as unknown as Trading
}

function enterWithMouse(element: Element) {
  const event = new Event("pointerover", { bubbles: true })
  Object.defineProperty(event, "pointerType", { value: "mouse" })
  element.dispatchEvent(event)
}

let host: HTMLDivElement
let root: Root

async function drawActivity(
  positions: TradePosition[],
  onSelectMarket: (marketKey: string) => void = () => {},
  tab: "positions" | "orders" | "journal" = "positions",
  state: Trading = trading(positions)
) {
  await act(async () => {
    root.render(
      <TooltipProvider>
        <ActivityPanel
          trading={state}
          tab={tab}
          onTabChange={() => {}}
          catalogs={[catalog]}
          wallets={[]}
          onSelectMarket={onSelectMarket}
          onAddToPosition={() => {}}
          canChangeLeverage={false}
          leverageRefusal={null}
          canAdjustMargin={false}
          marginRefusal={null}
          shownTrade={null}
          onShowTrade={() => {}}
          fit={{ grow: () => {}, shrink: () => {}, grown: () => false }}
        />
      </TooltipProvider>
    )
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  marks.clear()
  marks.set(market.key, 110)
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe("the Journal tab", () => {
  it("passes incomplete fills into the visible table and its count", async () => {
    const fill: LiveFill = {
      fillId: "saved-fill",
      orderId: "saved-order",
      walletId: "practice",
      marketKey: market.key,
      side: "buy",
      px: 100,
      sz: 1,
      at: 1_000,
      closedPnl: 0,
      fee: 0.05,
      dir: "Buy",
      liquidation: false,
      live: false,
    }
    const state = { ...trading([]), journalFills: [fill] }

    await drawActivity([], () => {}, "journal", state)

    expect(host.textContent).toContain("Journal table 1")
    const tab = Array.from(host.querySelectorAll('[role="tab"]')).find((one) =>
      one.textContent?.includes("Journal")
    )
    expect(tab?.textContent).toContain("1")
  })
})

describe("the Positions tab glance", () => {
  it("keeps missing-stop wording off the tab", async () => {
    await drawActivity([position])

    const tab = Array.from(host.querySelectorAll('[role="tab"]')).find((one) =>
      one.textContent?.includes("Positions")
    )
    expect(tab?.textContent).not.toContain("without a stop")
  })

  it("opens a clickable position summary on hover", async () => {
    const onSelectMarket = vi.fn()
    await drawActivity([position], onSelectMarket)

    const trigger = Array.from(host.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent?.includes("Positions")
    )
    expect(trigger).not.toBeUndefined()

    await act(async () => {
      if (trigger) enterWithMouse(trigger)
      vi.advanceTimersByTime(150)
    })

    const popover = document.body.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    expect(popover?.textContent).toContain("Ticker")
    expect(popover?.textContent).toContain("Value")
    expect(popover?.textContent).toContain("Current P&L")
    expect(popover?.textContent).toContain("BTC")
    expect(popover?.textContent).toContain("$220.00")
    expect(popover?.textContent).toContain("+$20.00")

    await act(async () => {
      popover
        ?.querySelector<HTMLButtonElement>('[aria-label^="Open BTC market"]')
        ?.click()
    })
    expect(onSelectMarket).toHaveBeenCalledWith(market.key)
    expect(
      document.body.querySelector('[data-slot="popover-content"]')
    ).toBeNull()
  })

  it("sorts every column from its heading", async () => {
    const eth: TradePosition = {
      ...position,
      id: "position-2",
      marketKey: "hyperliquid:mainnet:ETH",
      szi: 1,
    }
    const sol: TradePosition = {
      ...position,
      id: "position-3",
      marketKey: "hyperliquid:mainnet:SOL",
      szi: 5,
    }
    marks.set(eth.marketKey, 90)
    marks.set(sol.marketKey, 110)
    await drawActivity([eth, position, sol])

    const trigger = host.querySelector("[data-positions-glance-trigger]")
    await act(async () => {
      if (trigger) enterWithMouse(trigger)
      vi.advanceTimersByTime(150)
    })

    const popover = document.body.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    const tickers = () =>
      Array.from(
        popover?.querySelectorAll<HTMLButtonElement>(
          'button[aria-label^="Open "]'
        ) ?? []
      ).map((row) => row.querySelector("span")?.textContent)
    const heading = (label: string) =>
      Array.from(popover?.querySelectorAll("button") ?? []).find((button) =>
        button.textContent?.includes(label)
      )

    expect(tickers()).toEqual(["SOL", "BTC", "ETH"])
    await act(async () => heading("Ticker")?.click())
    expect(tickers()).toEqual(["BTC", "ETH", "SOL"])
    await act(async () => heading("Ticker")?.click())
    expect(tickers()).toEqual(["SOL", "ETH", "BTC"])
    await act(async () => heading("Value")?.click())
    expect(tickers()).toEqual(["SOL", "BTC", "ETH"])
    await act(async () => heading("Value")?.click())
    expect(tickers()).toEqual(["ETH", "BTC", "SOL"])
    await act(async () => heading("Current P&L")?.click())
    expect(tickers()).toEqual(["SOL", "BTC", "ETH"])
  })

  it("does not open an empty position summary", async () => {
    await drawActivity([])

    const trigger = Array.from(host.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent?.includes("Positions")
    )
    await act(async () => {
      if (trigger) enterWithMouse(trigger)
      vi.advanceTimersByTime(300)
    })

    expect(host.querySelector("[data-positions-glance-trigger]")).toBeNull()
    expect(
      document.body.querySelector('[data-slot="popover-content"]')
    ).toBeNull()
  })
})
