// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PriceChart, type ChartSurface } from "@/components/trade/price-chart"
import type { CandleBar } from "@/lib/protocols/contracts"
import {
  DEFAULT_CHART_OPTIONS,
  type ChartType,
} from "@/lib/trade/chart-options"
import type { ChartColors } from "@/lib/trade/chart-theme"

const colors: ChartColors = {
  text: "#777",
  grid: "#ddd",
  border: "#ccc",
  primary: "#06c",
  up: "#0a0",
  down: "#a00",
  warning: "#aa0",
  alert: "#70c",
  neutral: "#777",
  badgeText: "#fff",
  foreground: "theme-foreground",
  upSoft: "#afa",
  downSoft: "#faa",
}

const engine = vi.hoisted(() => {
  const definitions = {
    candle: { kind: "candle" },
    histogram: { kind: "histogram" },
    line: { kind: "line" },
  }
  const visibleRange = { from: 1, to: 4 }
  const timeScale = {
    fitContent: vi.fn(),
    getVisibleLogicalRange: vi.fn(() => visibleRange),
    setVisibleLogicalRange: vi.fn(),
    logicalToCoordinate: vi.fn((bar: number) => bar * 10),
  }
  const series: Array<{
    definition: object
    options: object
    setData: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    applyOptions: ReturnType<typeof vi.fn>
    setSeriesOrder: ReturnType<typeof vi.fn>
    priceScale: ReturnType<typeof vi.fn>
    priceToCoordinate: ReturnType<typeof vi.fn>
    coordinateToPrice: ReturnType<typeof vi.fn>
    attachPrimitive: ReturnType<typeof vi.fn>
  }> = []
  const chart = {
    addSeries: vi.fn((definition: object, options: object) => {
      const scaleOwner = series.length === 0
      const next = {
        definition,
        options,
        setData: vi.fn(),
        update: vi.fn(),
        applyOptions: vi.fn(),
        setSeriesOrder: vi.fn(),
        priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
        priceToCoordinate: vi.fn((price: number) =>
          scaleOwner ? 1_000 - price * 5 : price + 2_000
        ),
        coordinateToPrice: vi.fn((coordinate: number) =>
          scaleOwner ? 200 - coordinate / 5 : coordinate + 2_000
        ),
        attachPrimitive: vi.fn(),
      }
      series.push(next)
      return next
    }),
    applyOptions: vi.fn(),
    removeSeries: vi.fn(),
    remove: vi.fn(),
    paneSize: vi.fn(() => ({ width: 600, height: 500 })),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    timeScale: vi.fn(() => timeScale),
  }
  const createChart = vi.fn(() => chart)

  function reset() {
    series.length = 0
    vi.clearAllMocks()
    timeScale.getVisibleLogicalRange.mockReturnValue(visibleRange)
  }

  return {
    chart,
    createChart,
    definitions,
    reset,
    series,
    timeScale,
    visibleRange,
  }
})

vi.mock("@/components/trade/chart-engine", () => ({
  loadChartEngine: () =>
    Promise.resolve({
      createChart: engine.createChart,
      CandlestickSeries: engine.definitions.candle,
      HistogramSeries: engine.definitions.histogram,
      LineSeries: engine.definitions.line,
      CrosshairMode: { Normal: 0, Hidden: 1 },
    }),
}))

vi.mock("@/lib/trade/chart-theme", () => ({
  readChartColors: () => colors,
}))

const candles: CandleBar[] = [
  { openTime: 1_000, open: 100, high: 112, low: 96, close: 108, volume: 14 },
  { openTime: 2_000, open: 108, high: 116, low: 102, close: 104, volume: 21 },
  { openTime: 3_000, open: 104, high: 107, low: 91, close: 94, volume: 34 },
  { openTime: 4_000, open: 94, high: 102, low: 90, close: 100, volume: 18 },
  { openTime: 5_000, open: 100, high: 110, low: 98, close: 106, volume: 27 },
]

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  engine.reset()
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})

function chart(type: ChartType) {
  return (
    <PriceChart
      candles={candles}
      options={{ ...DEFAULT_CHART_OPTIONS, chartType: type }}
      viewKey="BTC@15m"
      overlay={(surface: ChartSurface) => (
        <output aria-label="Stop line position">{surface.yOf(100)}</output>
      )}
    />
  )
}

async function renderChart(type: ChartType) {
  await act(async () => {
    root.render(chart(type))
    await Promise.resolve()
  })
}

describe("the chart price type", () => {
  it("switches the visible series without moving zoom or real-price overlays", async () => {
    await renderChart("candles")
    expect(host.querySelector("output")?.textContent).toBe("500")

    await renderChart("line")
    expect(host.querySelector("output")?.textContent).toBe("500")

    await renderChart("heikin-ashi")
    expect(host.querySelector("output")?.textContent).toBe("500")

    expect(engine.createChart).toHaveBeenCalledOnce()
    expect(engine.chart.removeSeries).toHaveBeenCalledTimes(2)
    expect(engine.timeScale.setVisibleLogicalRange).toHaveBeenCalledTimes(2)
    expect(engine.timeScale.setVisibleLogicalRange).toHaveBeenNthCalledWith(
      1,
      engine.visibleRange
    )
    expect(engine.timeScale.setVisibleLogicalRange).toHaveBeenNthCalledWith(
      2,
      engine.visibleRange
    )

    const scaleSeries = engine.series[0]
    const lineSeries = engine.series[3]
    const heikinAshiSeries = engine.series[4]
    expect(scaleSeries.setData).toHaveBeenLastCalledWith(
      candles.map(({ openTime, open, high, low, close }) => ({
        time: openTime / 1_000,
        open,
        high,
        low,
        close,
      }))
    )
    expect(lineSeries.setData).toHaveBeenLastCalledWith(
      candles.map(({ openTime, close }) => ({
        time: openTime / 1_000,
        value: close,
      }))
    )
    expect(heikinAshiSeries.setData).toHaveBeenLastCalledWith([
      { time: 1, open: 104, high: 112, low: 96, close: 104 },
      { time: 2, open: 104, high: 116, low: 102, close: 107.5 },
      { time: 3, open: 105.75, high: 107, low: 91, close: 99 },
      { time: 4, open: 102.375, high: 102.375, low: 90, close: 96.5 },
      { time: 5, open: 99.4375, high: 110, low: 98, close: 103.5 },
    ])
  })

  it("updates the live Heikin-Ashi bar and carries that tick through a type change", async () => {
    let onLiveBar: ((bar: CandleBar) => void) | null = null
    const liveBars = (onBar: (bar: CandleBar) => void) => {
      onLiveBar = onBar
      return () => {}
    }
    const view = (type: ChartType) => (
      <PriceChart
        candles={candles}
        options={{ ...DEFAULT_CHART_OPTIONS, chartType: type }}
        viewKey="BTC@15m"
        liveBars={liveBars}
      />
    )

    await act(async () => {
      root.render(view("heikin-ashi"))
      await Promise.resolve()
    })

    const live = {
      ...candles.at(-1)!,
      high: 112,
      close: 110,
      volume: 31,
    }
    await act(async () => onLiveBar?.(live))

    expect(engine.series[0].update).toHaveBeenLastCalledWith({
      time: 5,
      open: 100,
      high: 112,
      low: 98,
      close: 110,
    })
    expect(engine.series[1].update).toHaveBeenLastCalledWith({
      time: 5,
      open: 99.4375,
      high: 112,
      low: 98,
      close: 105,
    })

    await act(async () => root.render(view("line")))
    expect(engine.series[3].setData).toHaveBeenLastCalledWith(
      expect.arrayContaining([{ time: 5, value: 110 }])
    )
  })
})
