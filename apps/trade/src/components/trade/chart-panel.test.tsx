// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartPanel, IntervalPicker } from "@/components/trade/chart-panel"
import type { ChartSurface } from "@/components/trade/price-chart"
import { loadCandles } from "@/lib/api/candles"
import { bracketsWithStopAt } from "@/lib/trade/bracket-shortcuts"
import type { CandleInterval } from "@/lib/protocols/contracts"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import type { ChartColors } from "@/lib/trade/chart-theme"
import { DEFAULT_QUICK_ORDER } from "@/lib/trade/quick-order"
import type { Trading } from "@/components/trade/use-trading"

vi.mock("@/lib/api/candles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/candles")>()
  return { ...actual, loadCandles: vi.fn() }
})

vi.mock("@/lib/trade/live-market", () => ({
  watchLiveCandle: vi.fn(() => () => {}),
  useLiveCatchUp: vi.fn(),
}))

vi.mock("@/components/trade/paint/use-drawings", () => ({
  useChartDrawings: () => ({
    drawings: [],
    tool: null,
    selectedId: null,
    setTool: vi.fn(),
    setSelectedId: vi.fn(),
    create: vi.fn(),
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

vi.mock("@/components/trade/trade-lines-layer", async () => {
  const React = await import("react")
  return {
    TradeLinesLayer: ({
      surface,
      onSurface,
    }: {
      surface: unknown
      onSurface?: (surface: unknown) => void
    }) => {
      React.useLayoutEffect(() => onSurface?.(surface), [surface, onSurface])
      return null
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
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.clearAllMocks()
})

function Picker() {
  const [interval, setInterval] = React.useState<CandleInterval>("4h")
  return <IntervalPicker value={interval} onChange={setInterval} />
}

describe("the chart interval picker", () => {
  it("is one named choice and moves through intervals with the arrow keys", async () => {
    await act(async () => root.render(<Picker />))

    const group = host.querySelector<HTMLElement>("[role=tablist]")
    const tabs = Array.from(
      host.querySelectorAll<HTMLButtonElement>("[role=tab]")
    )

    expect(group?.getAttribute("aria-label")).toBe("Candle interval")
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "1m",
      "5m",
      "15m",
      "1h",
      "4h",
      "1d",
    ])
    expect(tabs[4].getAttribute("aria-selected")).toBe("true")

    tabs[4].focus()
    await act(async () => {
      tabs[4].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      )
    })

    expect(document.activeElement?.textContent).toBe("1d")
    expect(tabs[5].getAttribute("aria-selected")).toBe("true")
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
        initialQuickOrder={DEFAULT_QUICK_ORDER}
        options={DEFAULT_CHART_OPTIONS}
        indicators={{}}
        market={null}
        trading={trading}
        free={0}
        equity={0}
        shownTrade={null}
      />
    </React.StrictMode>
  )
}

describe("the chart candle request", () => {
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
      tpPx: 120,
      tpSz: 0.4,
      slPx: null,
      feesPaid: 0,
      updatedAt: 0,
    }

    expect(bracketsWithStopAt(position, 90)).toEqual({
      tpPx: 120,
      tpSz: 0.4,
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
          initialQuickOrder={DEFAULT_QUICK_ORDER}
          options={DEFAULT_CHART_OPTIONS}
          indicators={{}}
          market={{ key: "hyperliquid:BTC" } as never}
          trading={oneTrading}
          free={1000}
          equity={1000}
          shownTrade={null}
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

    expect(dragBrackets).toHaveBeenCalledWith("wallet-1", "hyperliquid:BTC", {
      tpPx: null,
      tpSz: null,
      slPx: 90,
    })
    expect(setBrackets).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain("Stop loss")
  })
})
