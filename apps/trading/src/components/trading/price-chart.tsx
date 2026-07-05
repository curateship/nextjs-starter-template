import * as React from "react"
import type {
  CandlestickData,
  HistogramData,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  Time,
  UTCTimestamp,
} from "lightweight-charts"

import { useCandles, type Candle } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import type { CandleInterval } from "@/lib/hl/ws"

// Trading-domain polarity convention (TradingView standard pair): up/down
// hues separated in lightness so direction survives CVD; everything else on
// the chart stays in recessive text/border tokens.
const UP_COLOR = "#089981"
const DOWN_COLOR = "#f23645"
const UP_VOLUME = "rgba(8, 153, 129, 0.35)"
const DOWN_VOLUME = "rgba(242, 54, 69, 0.35)"

export type ChartPriceLine = {
  id: string
  price: number
  color: string
  title: string
  lineStyle?: "solid" | "dashed"
  /** Draggable lines can be grabbed to re-price the underlying order. */
  draggable?: boolean
  /** Hide the price-axis label (dense grid-level lines). Default true. */
  axisLabelVisible?: boolean
  lineWidth?: 1 | 2
}

export type ChartMarker = {
  /** Fill time, ms epoch. */
  time: number
  side: "buy" | "sell"
  text?: string
}

const DRAG_HIT_PX = 6
/** After a drop, hold the line at its new price until the backend confirms. */
const DROP_HOLD_MS = 8_000

export function PriceChart({
  network,
  coin,
  interval,
  priceLines = [],
  markers = [],
  onLineDragEnd,
  onChartContextMenu,
}: {
  network: TradingNetwork
  coin: string
  interval: CandleInterval
  priceLines?: ChartPriceLine[]
  /** Buy/sell arrows at fill times. */
  markers?: ChartMarker[]
  /** Fired when a draggable price line is dropped at a new price. */
  onLineDragEnd?: (id: string, price: number) => void
  /** Fired on right-click with the price under the cursor. */
  onChartContextMenu?: (price: number, clientX: number, clientY: number) => void
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const chartRef = React.useRef<IChartApi | null>(null)
  const candleSeriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeSeriesRef = React.useRef<ISeriesApi<"Histogram"> | null>(null)
  const priceLineRefs = React.useRef<Map<string, IPriceLine>>(new Map())
  const markersPluginRef = React.useRef<ISeriesMarkersPluginApi<Time> | null>(
    null
  )
  const lineSpecsRef = React.useRef<Map<string, ChartPriceLine>>(new Map())
  const draggingRef = React.useRef<{ id: string; price: number } | null>(null)
  const recentDropsRef = React.useRef<
    Map<string, { price: number; until: number }>
  >(new Map())
  const lastTimeRef = React.useRef<number>(0)
  const [ready, setReady] = React.useState(false)

  const { candles, loading } = useCandles(network, coin, interval)

  const dragEndRef = React.useRef(onLineDragEnd)
  const contextMenuRef = React.useRef(onChartContextMenu)
  React.useEffect(() => {
    dragEndRef.current = onLineDragEnd
    contextMenuRef.current = onChartContextMenu
  }, [onLineDragEnd, onChartContextMenu])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let observer: MutationObserver | null = null
    let detachPointerHandlers: (() => void) | null = null

    void import("lightweight-charts").then(
      ({
        createChart,
        createSeriesMarkers,
        CandlestickSeries,
        HistogramSeries,
      }) => {
        if (disposed || !container) return

        const theme = chartTheme()
        const chart = createChart(container, {
          autoSize: true,
          layout: {
            background: { color: "transparent" },
            textColor: theme.textColor,
            attributionLogo: false,
          },
          grid: {
            vertLines: { color: theme.gridColor },
            horzLines: { color: theme.gridColor },
          },
          rightPriceScale: {
            borderVisible: false,
          },
          timeScale: {
            borderVisible: false,
            timeVisible: true,
            secondsVisible: false,
          },
          crosshair: { mode: 0 },
        })

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: UP_COLOR,
          downColor: DOWN_COLOR,
          borderVisible: false,
          wickUpColor: UP_COLOR,
          wickDownColor: DOWN_COLOR,
        })

        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          lastValueVisible: false,
          priceLineVisible: false,
        })
        chart
          .priceScale("volume")
          .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

        chartRef.current = chart
        candleSeriesRef.current = candleSeries
        volumeSeriesRef.current = volumeSeries
        markersPluginRef.current = createSeriesMarkers(candleSeries, [])
        setReady(true)

        // --- order-line dragging + right-click order menu -----------------
        const paneY = (event: MouseEvent) =>
          event.clientY - container.getBoundingClientRect().top

        const hitTestLine = (y: number): string | null => {
          for (const [id, spec] of lineSpecsRef.current) {
            if (!spec.draggable) continue
            const line = priceLineRefs.current.get(id)
            const price = line ? line.options().price : spec.price
            const lineY = candleSeries.priceToCoordinate(price)
            if (lineY !== null && Math.abs(lineY - y) <= DRAG_HIT_PX) return id
          }
          return null
        }

        const onMouseDown = (event: MouseEvent) => {
          if (event.button !== 0) return
          const id = hitTestLine(paneY(event))
          if (!id) return
          const line = priceLineRefs.current.get(id)
          if (!line) return
          draggingRef.current = { id, price: line.options().price }
          chart.applyOptions({ handleScroll: false, handleScale: false })
          event.preventDefault()
          event.stopPropagation()
        }

        const onMouseMove = (event: MouseEvent) => {
          const y = paneY(event)
          const dragging = draggingRef.current
          if (dragging) {
            const price = candleSeries.coordinateToPrice(y)
            if (price !== null && price > 0) {
              priceLineRefs.current.get(dragging.id)?.applyOptions({ price })
              dragging.price = price
            }
            event.preventDefault()
            return
          }
          container.style.cursor = hitTestLine(y) ? "ns-resize" : ""
        }

        const endDrag = () => {
          const dragging = draggingRef.current
          if (!dragging) return
          draggingRef.current = null
          chart.applyOptions({ handleScroll: true, handleScale: true })
          recentDropsRef.current.set(dragging.id, {
            price: dragging.price,
            until: Date.now() + DROP_HOLD_MS,
          })
          dragEndRef.current?.(dragging.id, dragging.price)
        }

        const onContextMenu = (event: MouseEvent) => {
          if (!contextMenuRef.current) return
          event.preventDefault()
          const price = candleSeries.coordinateToPrice(paneY(event))
          if (price !== null && price > 0) {
            contextMenuRef.current(price, event.clientX, event.clientY)
          }
        }

        container.addEventListener("mousedown", onMouseDown, true)
        container.addEventListener("mousemove", onMouseMove)
        container.addEventListener("mouseup", endDrag)
        container.addEventListener("mouseleave", endDrag)
        container.addEventListener("contextmenu", onContextMenu)
        detachPointerHandlers = () => {
          container.removeEventListener("mousedown", onMouseDown, true)
          container.removeEventListener("mousemove", onMouseMove)
          container.removeEventListener("mouseup", endDrag)
          container.removeEventListener("mouseleave", endDrag)
          container.removeEventListener("contextmenu", onContextMenu)
        }

        // Re-read theme tokens when the html class flips light/dark.
        observer = new MutationObserver(() => {
          const next = chartTheme()
          chart.applyOptions({
            layout: { textColor: next.textColor },
            grid: {
              vertLines: { color: next.gridColor },
              horzLines: { color: next.gridColor },
            },
          })
        })
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        })
      }
    )

    const priceLines = priceLineRefs.current
    return () => {
      disposed = true
      observer?.disconnect()
      detachPointerHandlers?.()
      priceLines.clear()
      markersPluginRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      chartRef.current?.remove()
      chartRef.current = null
      setReady(false)
    }
  }, [])

  React.useEffect(() => {
    const candleSeries = candleSeriesRef.current
    const volumeSeries = volumeSeriesRef.current
    if (!ready || !candleSeries || !volumeSeries || candles.length === 0) {
      return
    }

    const last = candles[candles.length - 1]
    const isIncremental =
      lastTimeRef.current > 0 &&
      last.t >= lastTimeRef.current &&
      candles.length > 1 &&
      candles[0].t < lastTimeRef.current

    if (isIncremental) {
      candleSeries.update(toCandleData(last))
      volumeSeries.update(toVolumeData(last))
    } else {
      candleSeries.setData(candles.map(toCandleData))
      volumeSeries.setData(candles.map(toVolumeData))
      chartRef.current?.timeScale().fitContent()
    }
    lastTimeRef.current = last.t
  }, [ready, candles])

  React.useEffect(() => {
    lastTimeRef.current = 0
  }, [network, coin, interval])

  React.useEffect(() => {
    const candleSeries = candleSeriesRef.current
    if (!ready || !candleSeries) return

    const existing = priceLineRefs.current
    lineSpecsRef.current = new Map(priceLines.map((spec) => [spec.id, spec]))

    for (const [id, line] of existing) {
      if (!priceLines.some((next) => next.id === id)) {
        if (draggingRef.current?.id === id) continue
        candleSeries.removePriceLine(line)
        existing.delete(id)
        recentDropsRef.current.delete(id)
      }
    }
    for (const spec of priceLines) {
      // Never fight the user's hand or snap back before the backend confirms.
      if (draggingRef.current?.id === spec.id) continue
      let price = spec.price
      const drop = recentDropsRef.current.get(spec.id)
      if (drop) {
        const confirmed =
          Math.abs(spec.price - drop.price) <=
          Math.max(Math.abs(drop.price), 1) * 1e-6
        if (confirmed || Date.now() > drop.until) {
          recentDropsRef.current.delete(spec.id)
        } else {
          price = drop.price
        }
      }

      const current = existing.get(spec.id)
      if (current) {
        current.applyOptions({
          price,
          color: spec.color,
          title: spec.title,
        })
      } else {
        existing.set(
          spec.id,
          candleSeries.createPriceLine({
            price,
            color: spec.color,
            title: spec.title,
            lineWidth: spec.lineWidth ?? (spec.draggable ? 2 : 1),
            lineStyle: spec.lineStyle === "solid" ? 0 : 2,
            axisLabelVisible: spec.axisLabelVisible ?? true,
          })
        )
      }
    }
  }, [ready, priceLines])

  React.useEffect(() => {
    const plugin = markersPluginRef.current
    if (!ready || !plugin) return
    plugin.setMarkers(
      [...markers]
        .sort((a, b) => a.time - b.time)
        .map((marker) => ({
          time: Math.floor(marker.time / 1000) as UTCTimestamp,
          position: marker.side === "buy" ? "belowBar" : "aboveBar",
          shape: marker.side === "buy" ? "arrowUp" : "arrowDown",
          color: marker.side === "buy" ? UP_COLOR : DOWN_COLOR,
          ...(marker.text ? { text: marker.text } : {}),
        }))
    )
  }, [ready, markers])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {loading && candles.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Loading {coin} candles…
        </div>
      ) : null}
    </div>
  )
}

function toCandleData(candle: Candle): CandlestickData {
  return {
    time: (candle.t / 1000) as UTCTimestamp,
    open: Number(candle.o),
    high: Number(candle.h),
    low: Number(candle.l),
    close: Number(candle.c),
  }
}

function toVolumeData(candle: Candle): HistogramData {
  return {
    time: (candle.t / 1000) as UTCTimestamp,
    value: Number(candle.v),
    color: Number(candle.c) >= Number(candle.o) ? UP_VOLUME : DOWN_VOLUME,
  }
}

/**
 * Theme colors for the chart chrome. The app's Tailwind v4 tokens are
 * oklch(), which lightweight-charts cannot parse, so the chart uses its own
 * recessive neutrals keyed off the html `dark` class.
 */
function chartTheme() {
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  return {
    textColor: isDark ? "#9ca3af" : "#6b7280",
    gridColor: isDark ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.07)",
  }
}
