// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartPanel, IntervalPicker } from "@/components/trade/chart-panel"
import { loadCandles } from "@/lib/api/candles"
import type { CandleInterval } from "@/lib/protocols/contracts"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import { DEFAULT_QUICK_ORDER } from "@/lib/trade/quick-order"
import type { Trading } from "@/components/trade/use-trading"

vi.mock("@/lib/api/candles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/candles")>()
  return { ...actual, loadCandles: vi.fn() }
})

vi.mock("@/lib/trade/live-market", () => ({
  useLiveCandle: vi.fn(),
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
