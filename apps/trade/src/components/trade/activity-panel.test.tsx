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
const navigate = vi.hoisted(() => vi.fn())
const everywhere = vi.hoisted(() => ({
  read: vi.fn(),
}))

vi.mock("@/lib/api/trade/all-positions", () => ({
  loadAllPositions: everywhere.read,
}))

vi.mock("@/lib/trade/live-market", () => ({
  useLiveMarks: () => marks,
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  getRouteApi: () => ({ useLoaderData: () => ({ user: { id: "user" } }) }),
  useNavigate: () => navigate,
}))

vi.mock("@/components/trade/positions-table", () => ({
  PositionsTable: ({ positions, onFlip }: { positions: TradePosition[]; onFlip: (position: TradePosition) => void }) => (
    <div>Positions table{positions.map((position) => <button key={position.id} onClick={() => onFlip(position)}>Flip position</button>)}</div>
  ),
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
          protocol="hyperliquid"
          network="mainnet"
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
  navigate.mockReset()
  everywhere.read.mockReset()
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

describe("under 1280px", () => {
  it("draws the three tables in the Positions panel and leaves the chart on screen", async () => {
    const target = document.createElement("div")
    document.body.append(target)
    try {
      await act(async () => {
        root.render(
          <TooltipProvider>
            <ActivityPanel
              protocol="hyperliquid"
              network="mainnet"
              trading={trading([position])}
              tab="positions"
              onTabChange={() => {}}
              catalogs={[catalog]}
              wallets={[]}
              onSelectMarket={() => {}}
              onAddToPosition={() => {}}
              canChangeLeverage={false}
              leverageRefusal={null}
              canAdjustMargin={false}
              marginRefusal={null}
              shownTrade={null}
              onShowTrade={() => {}}
              fit={{ grow: () => {}, shrink: () => {}, grown: () => false }}
              chart={{ label: "BTC chart", content: <div data-testid="the-chart" /> }}
              tablesIn={{ target }}
            />
          </TooltipProvider>
        )
      })
      const tabs = (box: Element) =>
        Array.from(box.querySelectorAll('[role="tab"]')).map((tab) =>
          tab.getAttribute("aria-label")
        )
      // The chart's header has no tabs left, only the chart's name as a heading.
      expect(tabs(host)).toEqual([])
      expect(host.querySelector("h2")?.textContent).toBe("BTC chart")
      expect(tabs(target)).toEqual(["Positions", "Open orders", "Journal"])
      // The Positions table's own tab content is in the panel, not under the chart.
      expect(target.querySelector('[role="tabpanel"][id$="-content-positions"]')).not.toBeNull()
      expect(host.querySelector('[role="tabpanel"][id$="-content-positions"]')).toBeNull()
      // With Positions picked, the chart is still drawn behind the panel.
      const chart = host.querySelector('[data-testid="the-chart"]')
      expect(chart).not.toBeNull()
      expect(chart!.closest('[data-state="inactive"]')?.className).not.toContain("hidden")
    } finally {
      target.remove()
    }
  })
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
    expect(popover?.textContent).toContain("Type")
    expect(popover?.textContent).toContain("Long")
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

  it("shows and sorts Long and Short in the Type column", async () => {
    const short = { ...position, id: "short", marketKey: "hyperliquid:mainnet:ETH", szi: -1 }
    await drawActivity([short, position])
    const trigger = host.querySelector("[data-positions-glance-trigger]")
    await act(async () => {
      if (trigger) enterWithMouse(trigger)
      vi.advanceTimersByTime(150)
    })
    const popover = document.body.querySelector('[data-slot="popover-content"]')!
    const rows = () => Array.from(popover.querySelectorAll('button[aria-label^="Open "]'))
    const typeHeading = Array.from(popover.querySelectorAll("button")).find(
      (button) => button.textContent === "Type"
    )!
    await act(async () => typeHeading.click())
    expect(rows().map((row) => row.children[1].textContent)).toEqual(["Long 1×", "Short 1×"])
    expect(rows()[0].getAttribute("aria-label")).toContain("Long")
    await act(async () => typeHeading.click())
    expect(rows().map((row) => row.children[1].textContent)).toEqual(["Short 1×", "Long 1×"])
  })

  it("waits long enough after the pointer leaves the tab for it to reach the popover", async () => {
    await drawActivity([position])
    const trigger = host.querySelector("[data-positions-glance-trigger]")!
    await act(async () => {
      enterWithMouse(trigger)
      vi.advanceTimersByTime(150)
    })
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" }))
      trigger.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false, pointerType: "mouse" }))
      vi.advanceTimersByTime(400)
    })
    expect(document.body.querySelector('[data-slot="popover-content"]')).not.toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    expect(document.body.querySelector('[data-slot="popover-content"]')).toBeNull()
  })

  it("sums the rows showing in a Total row under the list", async () => {
    const eth: TradePosition = { ...position, id: "position-2", marketKey: "hyperliquid:mainnet:ETH", szi: 1 }
    marks.set(eth.marketKey, 90)
    await drawActivity([position, eth])
    const trigger = host.querySelector("[data-positions-glance-trigger]")
    await act(async () => {
      if (trigger) enterWithMouse(trigger)
      vi.advanceTimersByTime(150)
    })
    const popover = document.body.querySelector<HTMLElement>('[data-slot="popover-content"]')!
    const rows = Array.from(popover.querySelectorAll<HTMLElement>('button[aria-label^="Open "]'))
    const total = popover.querySelector<HTMLElement>("[data-positions-glance-total]")
    expect(rows).toHaveLength(2)
    // $220 + $90 and +$20 - $10.
    expect(total?.textContent).toBe("Total$310.00+$10.00")
  })

  it("draws no Total row when there is nothing to add up", async () => {
    await drawActivity([])
    const trigger = host.querySelector("[data-positions-glance-trigger]")
    await act(async () => {
      if (trigger) enterWithMouse(trigger)
      vi.advanceTimersByTime(150)
    })
    expect(document.body.querySelector("[data-positions-glance-total]")).toBeNull()
  })

  it("opens with an empty line when this exchange holds nothing", async () => {
    await drawActivity([])

    const trigger = host.querySelector("[data-positions-glance-trigger]")
    await act(async () => {
      if (trigger) enterWithMouse(trigger)
      vi.advanceTimersByTime(150)
    })

    const popover = document.body.querySelector('[data-slot="popover-content"]')
    expect(popover?.textContent).toContain("No open positions on Hyperliquid.")
    expect(everywhere.read).not.toHaveBeenCalled()
  })

  it("lists every exchange on the All protocols tab and opens another exchange's chart", async () => {
    const aster: TradePosition = {
      ...position,
      id: "aster-1",
      marketKey: "aster:mainnet:SOLUSDT",
      szi: 2,
    }
    everywhere.read.mockResolvedValue({
      // The page's own exchange comes back too, and is not listed twice.
      positions: [position, aster],
      marks: { [aster.marketKey]: 150 },
      unavailable: [],
    })
    const onSelectMarket = vi.fn()
    await drawActivity([position], onSelectMarket)

    const trigger = host.querySelector("[data-positions-glance-trigger]")
    await act(async () => {
      if (trigger) enterWithMouse(trigger)
      vi.advanceTimersByTime(150)
    })
    const popover = document.body.querySelector<HTMLElement>('[data-slot="popover-content"]')!
    const tab = (name: string) =>
      Array.from(popover.querySelectorAll('[role="tab"]')).find((one) =>
        one.textContent?.startsWith(name)
      )
    expect(tab("Hyperliquid")?.getAttribute("data-state")).toBe("active")

    await act(async () => {
      tab("All protocols")?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(everywhere.read).toHaveBeenCalledTimes(1)
    const rows = Array.from(popover.querySelectorAll('button[aria-label^="Open "]'))
    expect(rows).toHaveLength(2)
    expect(popover.textContent).toContain("Aster")
    expect(popover.textContent).toContain("$300.00")

    await act(async () => {
      popover.querySelector<HTMLButtonElement>('[aria-label^="Open SOLUSDT market on Aster"]')?.click()
    })
    expect(onSelectMarket).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it("picks all or one protocol from a dropdown on both tabs", async () => {
    const aster: TradePosition = {
      ...position,
      id: "aster-1",
      marketKey: "aster:mainnet:SOLUSDT",
      szi: 2,
    }
    everywhere.read.mockResolvedValue({
      positions: [position, aster],
      marks: { [aster.marketKey]: 150 },
      unavailable: [],
    })
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: () => {} },
      releasePointerCapture: { configurable: true, value: () => {} },
      scrollIntoView: { configurable: true, value: () => {} },
    })
    await drawActivity([position])

    const trigger = host.querySelector("[data-positions-glance-trigger]")
    await act(async () => {
      if (trigger) enterWithMouse(trigger)
      vi.advanceTimersByTime(150)
    })
    const popover = document.body.querySelector<HTMLElement>('[data-slot="popover-content"]')!
    const dropdown = () =>
      popover.querySelector<HTMLElement>('[role="combobox"][aria-label="Protocol"]')
    const rows = () => Array.from(popover.querySelectorAll('button[aria-label^="Open "]'))
    const activeTab = () =>
      popover.querySelector('[role="tab"][data-state="active"]')?.textContent ?? ""
    // On the page's own tab the dropdown names that exchange.
    expect(dropdown()?.textContent).toBe("Hyperliquid")

    const open = async () => {
      await act(async () => {
        dropdown()?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }))
        dropdown()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        await Promise.resolve()
      })
      await act(async () => {
        await Promise.resolve()
      })
      return Array.from(document.body.querySelectorAll<HTMLElement>("[role=option]"))
    }
    // Opening it from the first tab reads the other exchanges.
    const choices = await open()
    expect(everywhere.read).toHaveBeenCalledTimes(1)
    // The page reports the pointer gone from the glance while the list is
    // open; the glance must not shut under it.
    await act(async () => {
      popover.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" }))
      popover.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false, pointerType: "mouse" }))
      vi.advanceTimersByTime(1000)
    })
    expect(popover.isConnected).toBe(true)
    expect(document.body.querySelector("[role=listbox]")).not.toBeNull()
    expect(choices.map((choice) => choice.textContent?.trim())).toEqual([
      "All protocols",
      "Hyperliquid",
      "Aster",
    ])
    await act(async () => choices[2]?.click())
    expect(activeTab()).toMatch(/^All protocols/)
    expect(dropdown()?.textContent).toBe("Aster")
    expect(rows()).toHaveLength(1)
    expect(rows()[0]?.getAttribute("aria-label")).toContain("on Aster")
    expect(
      popover.querySelector("[data-positions-glance-total]")?.textContent
    ).toContain("$300.00")

    const again = await open()
    await act(async () => again[0]?.click())
    expect(dropdown()?.textContent).toBe("All protocols")
    expect(rows()).toHaveLength(2)

    // Picking the page's own exchange goes back to the first tab.
    const last = await open()
    await act(async () => last[1]?.click())
    expect(activeTab()).toMatch(/^Hyperliquid/)
    expect(dropdown()?.textContent).toBe("Hyperliquid")
    expect(rows()).toHaveLength(1)

    for (const name of ["hasPointerCapture", "setPointerCapture", "releasePointerCapture", "scrollIntoView"]) {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]
    }
  })

  it("says so when the other exchanges cannot be read, and tries again", async () => {
    everywhere.read.mockRejectedValueOnce(new Error("down"))
    await drawActivity([position])
    const trigger = host.querySelector("[data-positions-glance-trigger]")
    await act(async () => {
      if (trigger) enterWithMouse(trigger)
      vi.advanceTimersByTime(150)
    })
    const popover = document.body.querySelector<HTMLElement>('[data-slot="popover-content"]')!
    await act(async () => {
      Array.from(popover.querySelectorAll('[role="tab"]'))
        .find((one) => one.textContent?.startsWith("All protocols"))
        ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(popover.textContent).toContain("The other exchanges could not be read.")

    everywhere.read.mockResolvedValue({ positions: [], marks: {}, unavailable: [] })
    await act(async () => {
      Array.from(popover.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Try again"))
        ?.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(everywhere.read).toHaveBeenCalledTimes(2)
    expect(popover.textContent).not.toContain("could not be read")
  })
})


describe("flip confirmation", () => {
  it("names the opposite direction and sends one flip only after confirmation", async () => {
    const state = trading([position])
    await drawActivity([position], () => {}, "positions", state)
    await act(async () => Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Flip position")!.click())
    expect(document.body.textContent).toContain("Flip BTC to short")
    expect(document.body.textContent).toContain("same number of coins")
    expect(state.flip).not.toHaveBeenCalled()
    await act(async () => Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent === "Flip trade")!.click())
    expect(state.flip).toHaveBeenCalledExactlyOnceWith(position.walletId, position.marketKey, position.szi)
  })
})
