// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartPanel, IntervalPicker } from "@/components/trade/chart-panel"
import type { ChartSurface } from "@/components/trade/price-chart"
import { TooltipProvider } from "@/components/ui/tooltip"
import { loadCandles } from "@/lib/api/trade/candles"
import { bracketsWithStopAt } from "@/lib/trade/bracket-shortcuts"
import type { CandleInterval } from "@/lib/protocols/contracts"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import { CHART_INTERVAL_FAVORITES_STORAGE_KEY } from "@/lib/trade/chart-interval"
import type { ChartColors } from "@/lib/trade/chart-theme"
import { DEFAULT_QUICK_ORDER } from "@/lib/trade/quick-order"
import type { LiveTrade } from "@/lib/trade/live-trades"
import type { SmartLadder } from "@/lib/trade/smart-plan"
import type { Trading } from "@/components/trade/use-trading"

vi.mock("@/lib/api/trade/candles", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/trade/candles")>()
  return { ...actual, loadCandles: vi.fn() }
})

vi.mock("@/lib/trade/live-market", () => ({
  liveMarkOf: vi.fn(() => null),
  watchLiveCandle: vi.fn(() => () => {}),
  useLiveCatchUp: vi.fn(),
}))

// The isomorphic cookie read inside this shell hook throws under the test
// runner, which has neither a server request nor a real browser cookie jar.
// Mocked here rather than guarded in the hook, because the hook is a shell
// file and an edited shell file forks on every future merge.
vi.mock("@/lib/layout/wide-screen", () => ({
  useWideScreen: () => true,
}))

const paint = vi.hoisted(() => ({
  tool: null as "level" | "trendline" | null,
  setTool: vi.fn(),
  create: vi.fn(),
}))

vi.mock("@/components/trade/paint/use-drawings", () => ({
  useChartDrawings: () => ({
    drawings: [],
    tool: paint.tool,
    selectedId: null,
    setTool: paint.setTool,
    setSelectedId: vi.fn(),
    create: paint.create,
    move: vi.fn(),
    remove: vi.fn(),
    clearAll: vi.fn(),
  }),
}))

vi.mock("@/components/trade/use-chart-view", () => ({
  useRememberedChartView: () => ({
    readView: () => null,
    onViewChange: vi.fn(),
  }),
}))

vi.mock("@/components/trade/price-chart", async () => {
  const surface: ChartSurface = {
    width: 800,
    height: 500,
    axisWidth: 60,
    xOf: () => 0,
    xOfContainingBar: () => 0,
    timeAt: () => 0,
    barAt: () => 0,
    yOf: () => 100,
    priceAt: () => 90,
  }
  const colors: ChartColors = {
    text: "#777",
    grid: "#ddd",
    border: "#ddd",
    primary: "#00f",
    up: "#0a0",
    down: "#a00",
    warning: "#aa0",
    alert: "#70c",
    neutral: "#777",
    badgeText: "#fff",
    upSoft: "#afa",
    downSoft: "#faa",
  }
  return {
    PriceChart: ({
      overlay,
    }: {
      overlay?: (surface: ChartSurface, colors: ChartColors) => React.ReactNode
    }) => <div data-testid="price-chart">{overlay?.(surface, colors)}</div>,
  }
})

vi.mock("@/components/trade/chart-engine", () => ({
  prefetchChartEngine: vi.fn(),
}))

vi.mock("@/components/trade/trade-lines-layer", async () => {
  const React = await import("react")
  return {
    TradeLinesLayer: ({
      surface,
      onSurface,
      positions = [],
      entryBadge,
    }: {
      surface: unknown
      onSurface?: (surface: unknown) => void
      positions?: Array<{ id: string }>
      entryBadge?: (position: { id: string }) => {
        onRemove: (() => void) | null
      } | null
    }) => {
      React.useLayoutEffect(() => onSurface?.(surface), [surface, onSurface])
      return (
        <>
          {positions.map((position) => {
            const badge = entryBadge?.(position)
            return badge?.onRemove ? (
              <button
                key={position.id}
                type="button"
                aria-label={`Remove ladder for ${position.id}`}
                onClick={badge.onRemove}
              />
            ) : null
          })}
        </>
      )
    },
  }
})

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  window.localStorage.clear()
  paint.tool = null
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.clearAllMocks()
})

function Picker() {
  const [interval, setInterval] = React.useState<CandleInterval>("4h")
  return (
    <TooltipProvider>
      <IntervalPicker value={interval} onChange={setInterval} />
    </TooltipProvider>
  )
}

describe("the chart interval picker", () => {
  it("shows the current interval as one named dropdown", async () => {
    await act(async () => root.render(<Picker />))

    const trigger = host.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]'
    )
    expect(trigger?.textContent).toContain("4h")
    expect(trigger?.getAttribute("aria-haspopup")).toBe("menu")

    await act(async () => {
      trigger?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 })
      )
    })
    const options = Array.from(
      document.body.querySelectorAll<HTMLElement>("[role=menuitemcheckbox]")
    )
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "1m",
      "5m",
      "15m",
      "1h",
      "4h",
      "1d",
    ])

    await act(async () => options.at(-1)?.click())
    expect(
      host.querySelector('[role="tab"][aria-selected="true"]')?.textContent
    ).toContain("1d")
  })

  it("keeps favorite intervals as header shortcuts", async () => {
    await act(async () => root.render(<Picker />))

    const trigger = host.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]'
    )
    await act(async () => {
      trigger?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 })
      )
    })

    const addOneMinute = document.body.querySelector<HTMLElement>(
      '[aria-label="Add 1m to favorite timeframes"]'
    )
    await act(async () => addOneMinute?.click())

    expect(
      window.localStorage.getItem(CHART_INTERVAL_FAVORITES_STORAGE_KEY)
    ).toBe('["1m"]')
    expect(
      document.body.querySelector(
        '[aria-label="Remove 1m from favorite timeframes"]'
      )
    ).not.toBeNull()
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })

    const shortcut = host.querySelector<HTMLElement>(
      '[role="tab"][aria-label="Show 1m candles"]'
    )
    expect(
      host.querySelector('[role="tablist"][aria-label="Candle intervals"]')
    ).not.toBeNull()
    expect(shortcut).not.toBeNull()
    const selected = host.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]'
    )
    expect(selected?.querySelector("svg")).not.toBeNull()
    expect(
      host.querySelector('button[aria-label="Candle interval"]')
    ).toBeNull()
    await act(async () => {
      shortcut?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })
    expect(
      host
        .querySelector('[role="tab"][aria-label="Show 1m candles"]')
        ?.getAttribute("aria-selected")
    ).toBe("true")

    await act(async () => root.render(null))
    await act(async () => root.render(<Picker />))
    expect(
      host.querySelector('[role="tab"][aria-label="Show 1m candles"]')
    ).not.toBeNull()
  })
})

const trading = {
  busy: false,
  wallet: null,
  positions: [],
  orders: [],
  watchOrders: [],
  placing: [],
  ladders: [],
  grids: [],
  trades: [],
  fills: [],
  smartOrders: [],
  walletNames: new Map(),
} as unknown as Trading

function chart(key: string) {
  return (
    <React.StrictMode>
      <ChartPanel
        selectedKey={key}
        interval="15m"
        initialChartView={null}
        initialChart={null}
        initialDrawings={{ marketKey: null, rows: [], error: null }}
        initialQuickOrder={DEFAULT_QUICK_ORDER}
        options={DEFAULT_CHART_OPTIONS}
        indicators={{}}
        market={null}
        trading={trading}
        free={0}
        equity={0}
        shownTrade={null}

        addTo={null}

        onAddOpened={() => {}}
      />
    </React.StrictMode>
  )
}

describe("the chart candle request", () => {
  it("draws the opening candles and asks only for the deeper history", async () => {
    vi.useFakeTimers()
    vi.mocked(loadCandles).mockReturnValue(new Promise(() => {}))
    const key = "hyperliquid:mainnet:BTC"

    await act(async () =>
      root.render(
        <ChartPanel
          selectedKey={key}
          interval="4h"
          initialChartView={null}
          initialChart={{
            key: `${key}@4h`,
            interval: "4h",
            candles: [
              {
                openTime: 0,
                open: 100,
                high: 110,
                low: 90,
                close: 105,
                volume: 10,
              },
            ],
            error: null,
            pending: false,
          }}
          initialDrawings={{ marketKey: key, rows: [], error: null }}
          initialQuickOrder={DEFAULT_QUICK_ORDER}
          options={DEFAULT_CHART_OPTIONS}
          indicators={{}}
          market={null}
          trading={trading}
          free={0}
          equity={0}
          shownTrade={null}
          addTo={null}
          onAddOpened={() => {}}
        />
      )
    )

    expect(host.querySelector('[data-testid="price-chart"]')).not.toBeNull()
    expect(loadCandles).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(0))
    expect(loadCandles).toHaveBeenCalledOnce()
    expect(loadCandles).toHaveBeenCalledWith(key, "4h")
  })

  it("waits for the streamed opening slice instead of asking twice", async () => {
    vi.useFakeTimers()
    vi.mocked(loadCandles).mockReturnValue(new Promise(() => {}))
    const key = "hyperliquid:mainnet:BTC"
    const bar = {
      openTime: 0,
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 10,
    }
    const at = (pending: boolean, candles: (typeof bar)[]) => (
      <ChartPanel
        selectedKey={key}
        interval="4h"
        initialChartView={null}
        initialChart={{
          key: `${key}@4h`,
          interval: "4h",
          candles,
          error: null,
          pending,
        }}
        initialDrawings={{ marketKey: key, rows: [], error: null }}
        initialQuickOrder={DEFAULT_QUICK_ORDER}
        options={DEFAULT_CHART_OPTIONS}
        indicators={{}}
        market={null}
        trading={trading}
        free={0}
        equity={0}
        shownTrade={null}
        addTo={null}
        onAddOpened={() => {}}
      />
    )

    // The opening answer's exchange half has not landed: the slice named by
    // the marker is on its way, so nothing is fetched and nothing is drawn.
    await act(async () => root.render(at(true, [])))
    await act(async () => vi.advanceTimersByTime(1_000))
    expect(loadCandles).not.toHaveBeenCalled()
    expect(host.querySelector('[data-testid="price-chart"]')).toBeNull()

    // The slice lands as a prop change. The bars it carries are drawn, and
    // the only request that leaves is the deeper-history chase.
    await act(async () => root.render(at(false, [bar])))
    await act(async () => vi.advanceTimersByTime(0))
    expect(host.querySelector('[data-testid="price-chart"]')).not.toBeNull()
    expect(loadCandles).toHaveBeenCalledOnce()
    expect(loadCandles).toHaveBeenCalledWith(key, "4h")
  })

  it("asks at once on a cold load and settles rapid later choices", async () => {
    vi.useFakeTimers()
    vi.mocked(loadCandles).mockReturnValue(new Promise(() => {}))

    await act(async () => root.render(chart("hyperliquid:BTC")))
    expect(loadCandles).not.toHaveBeenCalled()

    await act(async () => vi.advanceTimersByTime(0))
    expect(loadCandles).toHaveBeenCalledTimes(1)
    expect(loadCandles).toHaveBeenLastCalledWith("hyperliquid:BTC", "15m")

    for (const market of ["ETH", "SOL", "DOGE", "XRP", "SUI", "AVAX"]) {
      await act(async () => root.render(chart(`hyperliquid:${market}`)))
    }

    await act(async () => vi.advanceTimersByTime(249))
    expect(loadCandles).toHaveBeenCalledTimes(1)

    await act(async () => vi.advanceTimersByTime(1))
    expect(loadCandles).toHaveBeenCalledTimes(2)
    expect(loadCandles).toHaveBeenLastCalledWith("hyperliquid:AVAX", "15m")
  })
})

describe("the chart paint tools", () => {
  it("offers and creates an alert when no wallet is selected", async () => {
    vi.useFakeTimers()
    vi.mocked(loadCandles).mockResolvedValue({
      candles: [
        { openTime: 0, open: 100, high: 101, low: 89, close: 90, volume: 1 },
      ],
    })
    const createAlert = vi.fn()
    const marketKey = "hyperliquid:mainnet:BTC"
    await act(async () =>
      root.render(
        <ChartPanel
          selectedKey={marketKey}
          interval="15m"
          initialChartView={null}
          initialChart={null}
          initialDrawings={{ marketKey: null, rows: [], error: null }}
          initialQuickOrder={DEFAULT_QUICK_ORDER}
          priceAlerts={[]}
          onCreatePriceAlert={createAlert}
          options={DEFAULT_CHART_OPTIONS}
          indicators={{}}
          market={{ key: marketKey, price: 105 } as never}
          trading={trading}
          free={0}
          equity={0}
          shownTrade={null}
          addTo={null}
          onAddOpened={() => {}}
        />
      )
    )
    await act(async () => vi.advanceTimersByTimeAsync(0))

    const plot = host.firstElementChild
    await act(async () => {
      plot?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 100,
        })
      )
    })
    const items = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    expect(items.map((item) => item.textContent)).toContain("Alert at $90")
    expect(items.map((item) => item.textContent)).not.toContain("Buy limit")

    await act(async () =>
      items.find((item) => item.textContent === "Alert at $90")?.click()
    )
    expect(createAlert).toHaveBeenCalledWith({
      marketKey,
      price: 90,
      currentPrice: 105,
    })
  })

  it("puts the held tool down on right-click without opening a menu", async () => {
    vi.useFakeTimers()
    vi.mocked(loadCandles).mockResolvedValue({
      candles: [
        { openTime: 0, open: 100, high: 101, low: 89, close: 90, volume: 1 },
      ],
    })
    paint.tool = "level"
    const oneTrading = {
      ...trading,
      wallet: { id: "wallet-1" },
    } as unknown as Trading

    await act(async () =>
      root.render(
        <ChartPanel
          selectedKey="hyperliquid:BTC"
          interval="15m"
          initialChartView={null}
          initialChart={null}
          initialDrawings={{ marketKey: null, rows: [], error: null }}
          initialQuickOrder={DEFAULT_QUICK_ORDER}
          options={DEFAULT_CHART_OPTIONS}
          indicators={{}}
          market={{ key: "hyperliquid:BTC" } as never}
          trading={oneTrading}
          free={1000}
          equity={1000}
          shownTrade={null}
          addTo={null}
          onAddOpened={() => {}}
        />
      )
    )
    await act(async () => vi.advanceTimersByTimeAsync(0))

    const sheet = host.querySelector<SVGRectElement>(
      "[data-chart-paint] > rect"
    )
    if (!sheet) throw new Error("The active paint sheet was not drawn")
    Object.assign(sheet, {
      hasPointerCapture: () => false,
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn(),
    })
    await act(async () => {
      sheet.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 2,
          clientX: 40,
          clientY: 100,
        })
      )
      sheet.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          button: 2,
          clientX: 40,
          clientY: 100,
        })
      )
    })
    const contextMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 100,
    })
    await act(async () => {
      sheet.dispatchEvent(contextMenu)
    })

    expect(paint.create).not.toHaveBeenCalled()
    expect(paint.setTool).toHaveBeenCalledWith(null)
    expect(contextMenu.defaultPrevented).toBe(true)
    expect(host.querySelector('[role="menu"]')).toBeNull()
  })
})

describe("the chart stop-loss shortcut", () => {
  it("places the clicked stop without changing the existing target", () => {
    const position = {
      id: "position-1",
      walletId: "wallet-1",
      marketKey: "hyperliquid:BTC",
      szi: 1,
      entryPx: 100,
      leverage: 2,
      maxLeverage: 50,
      targets: [{ px: 120, sz: 0.4, orderId: null }],
      tpPx: 120,
      tpSz: 0.4,
      slPx: null,
      feesPaid: 0,
      updatedAt: 0,
    }

    expect(bracketsWithStopAt(position, 90)).toEqual({
      targets: [{ px: 120, sz: 0.4 }],
      slPx: 90,
    })
  })

  it("draws from local state before the background save finishes", async () => {
    vi.useFakeTimers()
    vi.mocked(loadCandles).mockResolvedValue({
      candles: [
        { openTime: 0, open: 100, high: 101, low: 89, close: 90, volume: 1 },
      ],
    })
    const dragBrackets = vi.fn(() => new Promise<void>(() => {}))
    const setBrackets = vi.fn(() => new Promise<boolean>(() => {}))
    const position = {
      id: "position-1",
      walletId: "wallet-1",
      marketKey: "hyperliquid:BTC",
      szi: 1,
      entryPx: 100,
      leverage: 2,
      maxLeverage: 50,
      targets: [],
      tpPx: null,
      slPx: null,
      feesPaid: 0,
      updatedAt: 0,
    }
    const oneTrading = {
      ...trading,
      wallet: { id: "wallet-1" },
      positions: [position],
      walletNames: new Map([["wallet-1", "Practice"]]),
      dragBrackets,
      setBrackets,
    } as unknown as Trading

    await act(async () =>
      root.render(
        <ChartPanel
          selectedKey="hyperliquid:BTC"
          interval="15m"
          initialChartView={null}
          initialChart={null}
          initialDrawings={{ marketKey: null, rows: [], error: null }}
          initialQuickOrder={DEFAULT_QUICK_ORDER}
          options={DEFAULT_CHART_OPTIONS}
          indicators={{}}
          market={{ key: "hyperliquid:BTC" } as never}
          trading={oneTrading}
          free={1000}
          equity={1000}
          shownTrade={null}

          addTo={null}

          onAddOpened={() => {}}
        />
      )
    )
    await act(async () => vi.advanceTimersByTimeAsync(0))

    expect(host.querySelector('[data-testid="price-chart"]')).not.toBeNull()
    const plot = host.firstElementChild
    expect(plot).not.toBeNull()
    await act(async () => {
      plot?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 100,
        })
      )
    })
    const stop = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Stop loss"
    )
    expect(stop).toBeDefined()
    await act(async () => stop?.click())

    expect(dragBrackets).toHaveBeenCalledWith(position, {
      targets: [],
      slPx: 90,
    })
    expect(setBrackets).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain("Stop loss")
  })

  it("offers the clicked stop for a manual order that is still waiting", async () => {
    vi.useFakeTimers()
    vi.mocked(loadCandles).mockResolvedValue({
      candles: [
        { openTime: 0, open: 100, high: 101, low: 89, close: 90, volume: 1 },
      ],
    })
    const editOrder = vi.fn(async () => true)
    const dragBrackets = vi.fn(async () => undefined)
    const watched = {
      id: "watch-1",
      walletId: "wallet-1",
      marketKey: "hyperliquid:BTC",
      side: "buy" as const,
      px: 100,
      sz: 2,
      leverage: 1,
      maxLeverage: 50,
      reduceOnly: false,
      tpPx: 120,
      slPx: null,
      createdAt: 1,
      updatedAt: 1,
      watched: true as const,
    }
    const oneTrading = {
      ...trading,
      wallet: { id: "wallet-1" },
      positions: [
        {
          id: "another-position",
          walletId: "wallet-1",
          marketKey: "hyperliquid:BTC",
          szi: 1,
          entryPx: 100,
          leverage: 1,
          maxLeverage: 50,
          targets: [],
          tpPx: null,
          tpSz: null,
          slPx: null,
          feesPaid: 0,
          updatedAt: 1,
        },
      ],
      watchOrders: [watched],
      walletNames: new Map([["wallet-1", "Practice"]]),
      editOrder,
      dragBrackets,
    } as unknown as Trading

    await act(async () =>
      root.render(
        <ChartPanel
          selectedKey="hyperliquid:BTC"
          interval="15m"
          initialChartView={null}
          initialChart={null}
          initialDrawings={{ marketKey: null, rows: [], error: null }}
          initialQuickOrder={DEFAULT_QUICK_ORDER}
          options={DEFAULT_CHART_OPTIONS}
          indicators={{}}
          market={{ key: "hyperliquid:BTC" } as never}
          trading={oneTrading}
          free={1000}
          equity={1000}
          shownTrade={null}
          addTo={null}
          onAddOpened={() => {}}
        />
      )
    )
    await act(async () => vi.advanceTimersByTimeAsync(0))

    const plot = host.firstElementChild
    await act(async () => {
      plot?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 100,
        })
      )
    })
    const stop = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Stop loss"
    )
    expect(stop).toBeDefined()
    await act(async () => stop?.click())

    expect(editOrder).toHaveBeenCalledWith("wallet-1", "watch-1", {
      sz: 2,
      leverage: 1,
      tpPx: 120,
      slPx: 90,
    })
    expect(dragBrackets).not.toHaveBeenCalled()
  })
})

describe("the chart take-profit shortcut", () => {
  it("stays available after the position has its first target", async () => {
    vi.mocked(loadCandles).mockResolvedValue({
      candles: [
        { openTime: 0, open: 100, high: 101, low: 89, close: 90, volume: 1 },
      ],
    })
    const position = {
      id: "position-1",
      walletId: "wallet-1",
      marketKey: "hyperliquid:BTC",
      szi: -2,
      entryPx: 100,
      leverage: 2,
      maxLeverage: 50,
      targets: [{ px: 80, sz: 0.5, orderId: "target-1" }],
      tpPx: 80,
      tpSz: 0.5,
      slPx: 110,
      feesPaid: 0,
      updatedAt: 0,
    }
    const oneTrading = {
      ...trading,
      wallet: { id: "wallet-1" },
      positions: [position],
      walletNames: new Map([["wallet-1", "Practice"]]),
    } as unknown as Trading

    await act(async () =>
      root.render(
        <ChartPanel
          selectedKey="hyperliquid:BTC"
          interval="15m"
          initialChartView={null}
          initialChart={null}
          initialDrawings={{ marketKey: null, rows: [], error: null }}
          initialQuickOrder={DEFAULT_QUICK_ORDER}
          options={DEFAULT_CHART_OPTIONS}
          indicators={{}}
          market={{ key: "hyperliquid:BTC" } as never}
          trading={oneTrading}
          free={1000}
          equity={1000}
          shownTrade={null}
          addTo={null}
          onAddOpened={() => {}}
        />
      )
    )

    const plot = host.firstElementChild
    await act(async () => {
      plot?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 100,
        })
      )
    })

    expect(host.textContent).toContain("Take profit")
  })
})

describe("removing trade history from its chart arrow", () => {
  it("opens a dropdown and sends the whole trade in one click", async () => {
    vi.mocked(loadCandles).mockReturnValue(new Promise(() => {}))
    const marketKey = "hyperliquid:mainnet:BTC"
    const finished: LiveTrade = {
      id: "trade-1",
      walletId: "wallet-1",
      marketKey,
      live: true,
      direction: "long",
      openedAt: 1_000,
      closedAt: 2_000,
      heldMs: 1_000,
      entryPx: 100,
      exitPx: 110,
      sz: 1,
      amountUsd: 100,
      pnl: 10,
      returnPct: 10,
      ending: "closed",
      stopPx: null,
      fills: [
        {
          fillId: "entry",
          orderId: "entry-order",
          walletId: "wallet-1",
          marketKey,
          side: "buy",
          px: 100,
          sz: 1,
          at: 1_000,
          closedPnl: 0,
          fee: 0,
          dir: "Open Long",
          liquidation: false,
        },
        {
          fillId: "exit",
          orderId: "exit-order",
          walletId: "wallet-1",
          marketKey,
          side: "sell",
          px: 110,
          sz: 1,
          at: 2_000,
          closedPnl: 10,
          fee: 0,
          dir: "Close Long",
          liquidation: false,
        },
      ],
    }
    const hideTrades = vi.fn().mockResolvedValue(undefined)
    const oneTrading = {
      ...trading,
      trades: [finished],
      hideTrades,
    } as unknown as Trading

    await act(async () =>
      root.render(
        <ChartPanel
          selectedKey={marketKey}
          interval="15m"
          initialChartView={null}
          initialChart={{
            key: `${marketKey}@15m`,
            interval: "15m",
            candles: [
              {
                openTime: 0,
                open: 100,
                high: 110,
                low: 90,
                close: 105,
                volume: 1,
              },
            ],
            error: null,
            pending: false,
          }}
          initialDrawings={{ marketKey, rows: [], error: null }}
          initialQuickOrder={DEFAULT_QUICK_ORDER}
          options={DEFAULT_CHART_OPTIONS}
          indicators={{}}
          market={{ key: marketKey, price: 105 } as never}
          trading={oneTrading}
          free={0}
          equity={0}
          shownTrade={null}
          addTo={null}
          onAddOpened={() => {}}
        />
      )
    )

    const arrow = host.querySelector<SVGPolygonElement>(
      '[data-slot="trade-fill-mark"]'
    )
    await act(async () => {
      arrow?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 120,
          clientY: 160,
        })
      )
    })

    const remove = Array.from(
      document.body.querySelectorAll<HTMLElement>("[role=menuitem]")
    ).find((item) => item.textContent?.includes("Remove trade"))
    expect(remove).toBeTruthy()
    expect(document.body.textContent).not.toContain(
      "Remove this trade from the Journal?"
    )
    await act(async () => remove?.click())

    expect(hideTrades).toHaveBeenCalledWith([finished])
  })

  it("sends every stale fill when its wallet has no matching position", async () => {
    vi.mocked(loadCandles).mockReturnValue(new Promise(() => {}))
    const marketKey = "hyperliquid:mainnet:SOL"
    const first = {
      fillId: "open-1",
      orderId: "open-order-1",
      walletId: "paper-wallet",
      marketKey,
      side: "buy" as const,
      px: 100,
      sz: 1,
      at: 1_000,
      closedPnl: 0,
      fee: 0,
      dir: "Open Long",
      liquidation: false,
      live: false,
    }
    const hideTrades = vi.fn().mockResolvedValue(undefined)
    const oneTrading = {
      ...trading,
      fills: [
        first,
        {
          ...first,
          fillId: "open-2",
          orderId: "open-order-2",
          sz: 2,
        },
      ],
      // A current SOL position in another wallet must not make the old
      // Practice history look current. The wallet and market both identify
      // which fills still belong to a position.
      positions: [
        {
          id: "live-sol-position",
          walletId: "live-wallet",
          marketKey,
          szi: -1,
          entryPx: 150,
          leverage: 1,
          maxLeverage: 20,
          targets: [],
          tpPx: null,
          tpSz: null,
          slPx: null,
          feesPaid: 0,
          updatedAt: 3_000,
          live: true,
        },
      ],
      hideTrades,
    } as unknown as Trading

    await act(async () =>
      root.render(
        <ChartPanel
          selectedKey={marketKey}
          interval="15m"
          initialChartView={null}
          initialChart={{
            key: `${marketKey}@15m`,
            interval: "15m",
            candles: [
              {
                openTime: 0,
                open: 100,
                high: 110,
                low: 90,
                close: 105,
                volume: 1,
              },
            ],
            error: null,
            pending: false,
          }}
          initialDrawings={{ marketKey, rows: [], error: null }}
          initialQuickOrder={DEFAULT_QUICK_ORDER}
          options={DEFAULT_CHART_OPTIONS}
          indicators={{}}
          market={{ key: marketKey, price: 105 } as never}
          trading={oneTrading}
          free={0}
          equity={0}
          shownTrade={null}
          addTo={null}
          onAddOpened={() => {}}
        />
      )
    )

    expect(host.querySelectorAll('[data-slot="trade-fill-mark"]')).toHaveLength(
      2
    )
    const arrow = host.querySelector<SVGPolygonElement>(
      '[data-slot="trade-fill-mark"]'
    )
    await act(async () => {
      arrow?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 120,
          clientY: 160,
        })
      )
    })

    const remove = Array.from(
      document.body.querySelectorAll<HTMLElement>("[role=menuitem]")
    ).find((item) => item.textContent?.includes("Remove trade"))
    expect(remove).toBeTruthy()
    await act(async () => remove?.click())

    expect(hideTrades).toHaveBeenCalledOnce()
    expect(hideTrades).toHaveBeenCalledWith([
      expect.objectContaining({
        walletId: first.walletId,
        marketKey,
        fills: oneTrading.fills,
      }),
    ])
  })
})

function ladderWithStatuses(
  statuses: Array<"waiting" | "filled">
): SmartLadder {
  return {
    id: "ladder-1",
    walletId: "wallet-1",
    marketKey: "hyperliquid:BTC",
    kind: "dca",
    status: "active",
    flowRunId: null,
    createdAt: 1,
    updatedAt: 1,
    plan: {
      anchorPx: 110,
      steppedDown: 0,
      reclaim: null,
      rungs: statuses.map((status, index) => ({
        px: 100 - index * 10,
        sz: 1,
        budget: 100 - index * 10,
        status,
        orderId: null,
        sellOrderId: null,
        dead: false,
        touched: false,
      })),
      exitRungs: [],
      takeProfit: null,
      stopLoss: null,
    },
  } as unknown as SmartLadder
}

function chartWithLadder(
  ladder: SmartLadder,
  cancelLadder: (walletId: string, ladderId: string) => Promise<void>,
  equityOfWallet?: (walletId: string) => number | null
) {
  const positions = ladder.plan.rungs.some((rung) => rung.status === "filled")
    ? [
        {
          id: "position-1",
          walletId: ladder.walletId,
          marketKey: ladder.marketKey,
          szi: 1,
          entryPx: 100,
          leverage: 1,
          maxLeverage: 50,
          targets: [],
          tpPx: null,
          slPx: null,
          feesPaid: 0,
          updatedAt: 1,
        },
      ]
    : []
  const oneTrading = {
    ...trading,
    wallet: { id: ladder.walletId },
    positions,
    ladders: [ladder],
    smartOrders: [ladder],
    walletNames: new Map([[ladder.walletId, "Practice"]]),
    cancelLadder,
  } as unknown as Trading

  return (
    <TooltipProvider>
      <ChartPanel
        selectedKey={ladder.marketKey}
        interval="15m"
        initialChartView={null}
        initialChart={{
          key: `${ladder.marketKey}@15m`,
          interval: "15m",
          candles: [
            {
              openTime: 0,
              open: 100,
              high: 110,
              low: 90,
              close: 100,
              volume: 1,
            },
          ],
          error: null,
          pending: false,
        }}
        initialDrawings={{ marketKey: ladder.marketKey, rows: [], error: null }}
        initialQuickOrder={DEFAULT_QUICK_ORDER}
        options={DEFAULT_CHART_OPTIONS}
        indicators={{}}
        market={{ key: ladder.marketKey, price: 100 } as never}
        trading={oneTrading}
        free={1000}
        equity={1000}
        equityOfWallet={equityOfWallet}
        shownTrade={null}
        addTo={null}
        onAddOpened={() => {}}
      />
    </TooltipProvider>
  )
}

describe("removing a DCA ladder from the chart", () => {
  it("opens settings with the account value of the ladder's own wallet", async () => {
    vi.mocked(loadCandles).mockReturnValue(new Promise(() => {}))
    const ladder = ladderWithStatuses(["waiting", "waiting"])
    ladder.plan = {
      ...ladder.plan,
      anchor: "click",
      leverage: 1,
      maxLeverage: 50,
      sizeDecimals: 3,
      priceTick: null,
      twoGreen: false,
      greenInterval: null,
    }
    const equityOfWallet = vi.fn(() => 2_000)

    await act(async () =>
      root.render(chartWithLadder(ladder, async () => {}, equityOfWallet))
    )
    const settings = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Change the ladder settings"]'
    )
    await act(async () => {
      settings?.click()
      await import("@/components/trade/smart-ladder-settings-window")
    })

    await vi.waitFor(() => {
      const maxPosition = document.getElementById("ladder-pot")
      expect(maxPosition).toBeInstanceOf(HTMLInputElement)
      expect((maxPosition as HTMLInputElement).value).toBe("9.5")
    })
    expect(equityOfWallet).toHaveBeenCalledWith("wallet-1")
  })

  it("removes an empty ladder on the first press", async () => {
    vi.mocked(loadCandles).mockReturnValue(new Promise(() => {}))
    const cancelLadder = vi.fn(async () => {})
    await act(async () =>
      root.render(
        chartWithLadder(
          ladderWithStatuses(["waiting", "waiting"]),
          cancelLadder
        )
      )
    )

    const remove = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Stop buying deeper — cancel every waiting rung"]'
    )
    expect(remove).not.toBeNull()
    await act(async () => remove?.click())

    expect(cancelLadder).toHaveBeenCalledOnce()
    expect(cancelLadder).toHaveBeenCalledWith("wallet-1", "ladder-1")
    expect(document.body.textContent).not.toContain(
      "Stop this ladder buying deeper?"
    )
  })

  it("still asks before stopping a ladder that has bought", async () => {
    vi.mocked(loadCandles).mockReturnValue(new Promise(() => {}))
    const cancelLadder = vi.fn(async () => {})
    await act(async () =>
      root.render(
        chartWithLadder(ladderWithStatuses(["filled", "waiting"]), cancelLadder)
      )
    )

    const remove = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove ladder for position-1"]'
    )
    expect(remove).not.toBeNull()
    await act(async () => remove?.click())

    expect(cancelLadder).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(
      "Stop this ladder buying deeper?"
    )

    const confirm = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Stop the ladder"
    )
    await act(async () => confirm?.click())
    expect(cancelLadder).toHaveBeenCalledWith("wallet-1", "ladder-1")
  })
})
