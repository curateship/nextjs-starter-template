import * as React from "react"
import type {
  CandlestickData,
  HistogramData,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineData,
  SeriesDefinition,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts"

import { useShellRuntime } from "@/components/shell-layout"
import { useCandles } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import type { CandleInterval } from "@/lib/hl/ws"
import {
  bollinger,
  ema,
  macd,
  qflBase,
  rsi,
  vwap,
} from "@/lib/strategies/indicators"
import {
  indicatorColor,
  OSCILLATORS,
  type IndicatorConfig,
} from "@/lib/trading/indicators-config"

// Trading-domain polarity convention (TradingView standard pair): up/down
// hues separated in lightness so direction survives CVD; everything else on
// the chart stays in recessive text/border tokens.
const UP_COLOR = "#089981"
const DOWN_COLOR = "#f23645"
const UP_VOLUME = "rgba(8, 153, 129, 0.35)"
const DOWN_VOLUME = "rgba(242, 54, 69, 0.35)"
const MEASURE_UP_FILL = "rgba(8, 153, 129, 0.15)"
const MEASURE_DOWN_FILL = "rgba(242, 54, 69, 0.15)"
// MACD histogram polarity (theme-independent, like volume).
const MACD_UP = "rgba(8, 153, 129, 0.5)"
const MACD_DOWN = "rgba(242, 54, 69, 0.5)"

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

/**
 * Structural candle accepted by the shared chart view — covers both the live
 * `CandleWsEvent` (string fields) and the backtest `HistoryCandle` (numeric).
 */
export type ChartCandle = {
  /** Open time, ms since epoch. */
  t: number
  o: string | number
  h: string | number
  l: string | number
  c: string | number
  v: string | number
}

/** Generic extra line series (e.g. a strategy's breakout channel). */
export type ChartOverlayLine = {
  id: string
  label: string
  color: string
  dashed?: boolean
  points: { time: number; value: number }[]
}

/** Transient shift+drag measurement overlay, in container-local pixels. */
type Measurement = {
  left: number
  top: number
  width: number
  height: number
  up: boolean
  pctText: string
  priceText: string
  bars: number
  daysText: string
}

const DRAG_HIT_PX = 6
/** After a drop, hold the line at its new price until the backend confirms. */
const DROP_HOLD_MS = 8_000

/**
 * Data-agnostic chart view shared by the live trading terminal and the
 * backtest workspace: candles + volume, indicator overlays and oscillator
 * sub-panes, price lines (draggable when asked), buy/sell markers, and the
 * shift-click measure tool. Feed it candles from any source.
 */
export function PriceChartView({
  candles,
  loading = false,
  coin = "",
  dataKey = "static",
  priceLines = [],
  markers = [],
  indicators = [],
  overlayLines = [],
  visibleStartMs,
  focusRange = null,
  onCrosshairOhlc,
  onLineDragEnd,
  onChartContextMenu,
}: {
  /** Candles to render, ascending by open time. */
  candles: ChartCandle[]
  loading?: boolean
  /** Coin label for the loading state. */
  coin?: string
  /** Identity of the candle series; a change forces a full data reset. */
  dataKey?: string
  priceLines?: ChartPriceLine[]
  /** Buy/sell arrows at fill times. */
  markers?: ChartMarker[]
  /** Technical-indicator overlays and oscillator sub-panes. */
  indicators?: IndicatorConfig[]
  /** Generic extra line series (e.g. strategy channels). */
  overlayLines?: ChartOverlayLine[]
  /** Show from this time (ms) instead of fitting all content (hides warmup). */
  visibleStartMs?: number
  /** Zoom to this window (ms); clearing it restores the default view. */
  focusRange?: { fromMs: number; toMs: number } | null
  /** Crosshair candle readout; null when the cursor leaves the chart. */
  onCrosshairOhlc?: (candle: ChartCandle | null) => void
  /** Fired when a draggable price line is dropped at a new price. */
  onLineDragEnd?: (id: string, price: number) => void
  /** Fired on right-click with the price under the cursor. */
  onChartContextMenu?: (price: number, clientX: number, clientY: number) => void
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const chartRef = React.useRef<IChartApi | null>(null)
  const candleSeriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeSeriesRef = React.useRef<ISeriesApi<"Histogram"> | null>(null)
  const seriesCtorsRef = React.useRef<{
    LineSeries: SeriesDefinition<"Line">
    HistogramSeries: SeriesDefinition<"Histogram">
  } | null>(null)
  const indicatorSeriesRef = React.useRef<
    Map<
      string,
      { series: ISeriesApi<SeriesType>; recolor?: (isDark: boolean) => string }
    >
  >(new Map())
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
  const dataKeyRef = React.useRef<string | null>(null)
  const candleByTimeRef = React.useRef<Map<number, ChartCandle>>(new Map())
  // One short line series per QFL base mark — separate series so marks never
  // connect to each other across the gaps between them.
  const baseSeriesRef = React.useRef<ISeriesApi<"Line">[]>([])
  const overlaySeriesRef = React.useRef<Map<string, ISeriesApi<"Line">>>(
    new Map()
  )
  const [ready, setReady] = React.useState(false)
  const [measurement, setMeasurement] = React.useState<Measurement | null>(null)
  const measuringRef = React.useRef<{
    startX: number
    startY: number
    startPrice: number
  } | null>(null)
  const measureLockedRef = React.useRef(false)

  const dragEndRef = React.useRef(onLineDragEnd)
  const contextMenuRef = React.useRef(onChartContextMenu)
  const crosshairOhlcRef = React.useRef(onCrosshairOhlc)
  React.useEffect(() => {
    dragEndRef.current = onLineDragEnd
    contextMenuRef.current = onChartContextMenu
    crosshairOhlcRef.current = onCrosshairOhlc
  }, [onLineDragEnd, onChartContextMenu, onCrosshairOhlc])

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
        LineSeries,
      }) => {
        if (disposed || !container) return
        seriesCtorsRef.current = { LineSeries, HistogramSeries }

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

        chart.subscribeCrosshairMove((param) => {
          if (!crosshairOhlcRef.current) return
          const time = param.time as number | undefined
          crosshairOhlcRef.current(
            time !== undefined
              ? (candleByTimeRef.current.get(time) ?? null)
              : null
          )
        })

        // --- order-line dragging + right-click order menu -----------------
        const paneY = (event: MouseEvent) =>
          event.clientY - container.getBoundingClientRect().top
        const paneX = (event: MouseEvent) =>
          event.clientX - container.getBoundingClientRect().left
        const priceFormatter = candleSeries.priceFormatter()

        // Wipe the measurement and hand pan/zoom back to the chart.
        const clearMeasure = () => {
          if (!measuringRef.current) return
          measuringRef.current = null
          measureLockedRef.current = false
          chart.applyOptions({ handleScroll: true, handleScale: true })
          container.style.cursor = ""
          setMeasurement(null)
        }

        // Build the measure-tool readout from the anchor and the cursor point.
        const computeMeasurement = (
          anchor: { startX: number; startY: number; startPrice: number },
          x: number,
          y: number,
          endPrice: number
        ): Measurement => {
          const timeScale = chart.timeScale()
          const pct = ((endPrice - anchor.startPrice) / anchor.startPrice) * 100
          const priceDelta = endPrice - anchor.startPrice
          const startLogical = timeScale.coordinateToLogical(anchor.startX)
          const endLogical = timeScale.coordinateToLogical(x)
          const bars =
            startLogical !== null && endLogical !== null
              ? Math.abs(Math.round(endLogical - startLogical))
              : 0
          const startTime = timeScale.coordinateToTime(anchor.startX)
          const endTime = timeScale.coordinateToTime(x)
          const days =
            startTime !== null && endTime !== null
              ? Math.abs(Number(endTime) - Number(startTime)) / 86_400
              : 0
          return {
            left: Math.min(anchor.startX, x),
            top: Math.min(anchor.startY, y),
            width: Math.abs(x - anchor.startX),
            height: Math.abs(y - anchor.startY),
            up: endPrice >= anchor.startPrice,
            pctText: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
            priceText: `${priceDelta >= 0 ? "+" : ""}${priceFormatter.format(
              priceDelta
            )}`,
            bars,
            daysText: formatDays(days),
          }
        }

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
          // Measure tool (TradingView-style): shift-click anchors the start and
          // the result follows the cursor (no button held). The next click locks
          // the result in place; a further click anywhere dismisses it.
          if (measuringRef.current) {
            if (measureLockedRef.current) {
              clearMeasure()
            } else {
              measureLockedRef.current = true
              container.style.cursor = ""
            }
            event.preventDefault()
            event.stopPropagation()
            return
          }
          if (event.shiftKey) {
            const startPrice = candleSeries.coordinateToPrice(paneY(event))
            if (startPrice !== null) {
              measuringRef.current = {
                startX: paneX(event),
                startY: paneY(event),
                startPrice,
              }
              measureLockedRef.current = false
              chart.applyOptions({ handleScroll: false, handleScale: false })
              container.style.cursor = "crosshair"
              event.preventDefault()
              event.stopPropagation()
            }
            return
          }
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
          const measuring = measuringRef.current
          if (measuring) {
            if (measureLockedRef.current) return
            const y = paneY(event)
            const endPrice = candleSeries.coordinateToPrice(y)
            if (endPrice !== null) {
              setMeasurement(
                computeMeasurement(measuring, paneX(event), y, endPrice)
              )
            }
            event.preventDefault()
            return
          }
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

        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key === "Escape") clearMeasure()
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
        window.addEventListener("keydown", onKeyDown)
        detachPointerHandlers = () => {
          container.removeEventListener("mousedown", onMouseDown, true)
          container.removeEventListener("mousemove", onMouseMove)
          container.removeEventListener("mouseup", endDrag)
          container.removeEventListener("mouseleave", endDrag)
          container.removeEventListener("contextmenu", onContextMenu)
          window.removeEventListener("keydown", onKeyDown)
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
          const dark = document.documentElement.classList.contains("dark")
          for (const { series, recolor } of indicatorSeriesRef.current.values()) {
            if (recolor) series.applyOptions({ color: recolor(dark) })
          }
          for (const series of baseSeriesRef.current) {
            series.applyOptions({ color: indicatorColor("base", dark) })
          }
        })
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        })
      }
    )

    const priceLines = priceLineRefs.current
    const indicatorSeries = indicatorSeriesRef.current
    const overlaySeries = overlaySeriesRef.current
    return () => {
      disposed = true
      observer?.disconnect()
      detachPointerHandlers?.()
      priceLines.clear()
      indicatorSeries.clear()
      overlaySeries.clear()
      seriesCtorsRef.current = null
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

    const byTime = new Map<number, ChartCandle>()
    for (const candle of candles) byTime.set(Math.floor(candle.t / 1000), candle)
    candleByTimeRef.current = byTime

    const last = candles[candles.length - 1]
    const isIncremental =
      dataKeyRef.current === dataKey &&
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
      if (visibleStartMs && visibleStartMs < last.t) {
        chartRef.current?.timeScale().setVisibleRange({
          from: (visibleStartMs / 1000) as UTCTimestamp,
          to: (last.t / 1000) as UTCTimestamp,
        })
      } else {
        chartRef.current?.timeScale().fitContent()
      }
    }
    dataKeyRef.current = dataKey
    lastTimeRef.current = last.t
  }, [ready, candles, dataKey, visibleStartMs])

  // Zoom to a focused window (e.g. a selected backtest trade); clearing the
  // focus restores the default view for the loaded data.
  const hadFocusRef = React.useRef(false)
  React.useEffect(() => {
    const chart = chartRef.current
    if (!ready || !chart || lastTimeRef.current === 0) return
    const timeScale = chart.timeScale()
    if (focusRange) {
      timeScale.setVisibleRange({
        from: (focusRange.fromMs / 1000) as UTCTimestamp,
        to: (focusRange.toMs / 1000) as UTCTimestamp,
      })
    } else if (hadFocusRef.current) {
      if (visibleStartMs && visibleStartMs < lastTimeRef.current) {
        timeScale.setVisibleRange({
          from: (visibleStartMs / 1000) as UTCTimestamp,
          to: (lastTimeRef.current / 1000) as UTCTimestamp,
        })
      } else {
        timeScale.fitContent()
      }
    }
    hadFocusRef.current = Boolean(focusRange)
  }, [ready, focusRange, visibleStartMs])

  // Reconcile indicator series with the config: full rebuild on change so
  // oscillator sub-pane indices stay dense as they are toggled on/off.
  React.useEffect(() => {
    const chart = chartRef.current
    const ctors = seriesCtorsRef.current
    if (!ready || !chart || !ctors) return

    const map = indicatorSeriesRef.current
    for (const { series } of map.values()) chart.removeSeries(series)
    map.clear()

    const isDark = document.documentElement.classList.contains("dark")
    const guide = indicatorColor("guide", isDark)
    const oscillators = indicators.filter(
      (ind) => ind.enabled && OSCILLATORS.includes(ind.type)
    )
    const paneOf = (id: string) =>
      oscillators.findIndex((ind) => ind.id === id) + 1

    const addLine = (
      key: string,
      slot: string,
      override: string | undefined,
      paneIndex: number,
      opts?: { width?: 1 | 2; dashed?: boolean }
    ) => {
      const recolor = override
        ? undefined
        : (dark: boolean) => indicatorColor(slot, dark)
      const series = chart.addSeries(
        ctors.LineSeries,
        {
          color: override ?? indicatorColor(slot, isDark),
          lineWidth: opts?.width ?? 2,
          lineStyle: opts?.dashed ? 2 : 0,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIndex
      )
      map.set(key, { series, recolor })
      return series
    }

    for (const ind of indicators) {
      if (!ind.enabled) continue
      if (ind.type === "ema") {
        addLine(ind.id, ind.id, ind.color, 0)
      } else if (ind.type === "vwap") {
        addLine("vwap", "vwap", ind.color, 0)
      } else if (ind.type === "base") {
        // Rendered as separate per-mark series in the data effect below.
      } else if (ind.type === "bollinger") {
        addLine("bollinger-upper", "bollinger-band", undefined, 0, { width: 1 })
        addLine("bollinger-mid", "bollinger-mid", ind.color, 0, { dashed: true })
        addLine("bollinger-lower", "bollinger-band", undefined, 0, { width: 1 })
      } else if (ind.type === "rsi") {
        const series = addLine("rsi", "rsi", ind.color, paneOf(ind.id))
        for (const level of [70, 30]) {
          series.createPriceLine({
            price: level,
            color: guide,
            lineStyle: 2,
            lineWidth: 1,
            axisLabelVisible: true,
            title: String(level),
          })
        }
      } else if (ind.type === "macd") {
        const pane = paneOf(ind.id)
        const hist = chart.addSeries(
          ctors.HistogramSeries,
          { priceLineVisible: false, lastValueVisible: false },
          pane
        )
        map.set("macd-hist", { series: hist })
        const line = addLine("macd-line", "macd-line", ind.color, pane)
        addLine("macd-signal", "macd-signal", undefined, pane)
        line.createPriceLine({
          price: 0,
          color: guide,
          lineStyle: 2,
          lineWidth: 1,
          axisLabelVisible: false,
        })
      }
    }

    // Drop sub-panes left empty after disabling an oscillator.
    const panes = chart.panes()
    for (let i = panes.length - 1; i >= 1; i -= 1) {
      if (panes[i].getSeries().length === 0) chart.removePane(i)
    }
  }, [ready, indicators])

  // Generic extra line series (precomputed points, e.g. strategy channels).
  React.useEffect(() => {
    const chart = chartRef.current
    const ctors = seriesCtorsRef.current
    if (!ready || !chart || !ctors) return

    const map = overlaySeriesRef.current
    for (const series of map.values()) chart.removeSeries(series)
    map.clear()

    for (const overlay of overlayLines) {
      const series = chart.addSeries(
        ctors.LineSeries,
        {
          color: overlay.color,
          lineWidth: 1,
          lineStyle: overlay.dashed ? 2 : 0,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        0
      )
      series.setData(
        overlay.points.map(
          (point): LineData => ({
            time: (point.time / 1000) as UTCTimestamp,
            value: point.value,
          })
        )
      )
      map.set(overlay.id, series)
    }
  }, [ready, overlayLines])

  // Recompute indicator data on every candle/config change (cheap ≤1000 pts).
  React.useEffect(() => {
    const map = indicatorSeriesRef.current
    const chart = chartRef.current
    const ctors = seriesCtorsRef.current
    if (!ready || candles.length === 0 || !chart || !ctors) return

    // Rebuild QFL base marks from scratch each run (candles/config change).
    for (const series of baseSeriesRef.current) chart.removeSeries(series)
    baseSeriesRef.current = []
    const isDark = document.documentElement.classList.contains("dark")

    const closes = candles.map((candle) => Number(candle.c))
    const at = (i: number) => (candles[i].t / 1000) as UTCTimestamp
    const toLine = (values: number[]): LineData[] => {
      const data: LineData[] = []
      for (let i = 0; i < values.length; i += 1) {
        if (!Number.isNaN(values[i])) data.push({ time: at(i), value: values[i] })
      }
      return data
    }
    const setLine = (key: string, values: number[]) => {
      const entry = map.get(key)
      if (entry) (entry.series as ISeriesApi<"Line">).setData(toLine(values))
    }

    for (const ind of indicators) {
      if (!ind.enabled) continue
      if (ind.type === "ema") {
        setLine(ind.id, ema(closes, ind.params.period))
      } else if (ind.type === "vwap") {
        setLine("vwap", vwap(candles))
      } else if (ind.type === "base") {
        const { line } = qflBase(
          candles,
          ind.params.basePeriods,
          ind.params.pumpPeriods
        )
        const color = ind.color ?? indicatorColor("base", isDark)
        // Draw each contiguous run of equal value as its own 2-point series so
        // bases are separate short horizontal marks, never joined to each other.
        let i = 0
        while (i < line.length) {
          if (Number.isNaN(line[i])) {
            i += 1
            continue
          }
          let j = i
          while (j + 1 < line.length && line[j + 1] === line[i]) j += 1
          const series = chart.addSeries(
            ctors.LineSeries,
            {
              color,
              lineWidth: 3,
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false,
            },
            0
          )
          series.setData([
            { time: at(i), value: line[i] },
            { time: at(j), value: line[i] },
          ])
          baseSeriesRef.current.push(series)
          i = j + 1
        }
      } else if (ind.type === "bollinger") {
        const bands = bollinger(closes, ind.params.period, ind.params.k)
        setLine("bollinger-upper", bands.upper)
        setLine("bollinger-mid", bands.mid)
        setLine("bollinger-lower", bands.lower)
      } else if (ind.type === "rsi") {
        setLine("rsi", rsi(closes, ind.params.period))
      } else if (ind.type === "macd") {
        const result = macd(
          closes,
          ind.params.fast,
          ind.params.slow,
          ind.params.signal
        )
        setLine("macd-line", result.macd)
        setLine("macd-signal", result.signal)
        const histEntry = map.get("macd-hist")
        if (histEntry) {
          const data: HistogramData[] = []
          for (let i = 0; i < result.hist.length; i += 1) {
            if (!Number.isNaN(result.hist[i])) {
              data.push({
                time: at(i),
                value: result.hist[i],
                color: result.hist[i] >= 0 ? MACD_UP : MACD_DOWN,
              })
            }
          }
          ;(histEntry.series as ISeriesApi<"Histogram">).setData(data)
        }
      }
    }
  }, [ready, candles, indicators])

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
      {measurement ? (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          <div
            className="absolute border"
            style={{
              left: measurement.left,
              top: measurement.top,
              width: measurement.width,
              height: measurement.height,
              backgroundColor: measurement.up
                ? MEASURE_UP_FILL
                : MEASURE_DOWN_FILL,
              borderColor: measurement.up ? UP_COLOR : DOWN_COLOR,
            }}
          />
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded px-2 py-1 text-center text-white shadow-md"
            style={{
              left: measurement.left + measurement.width / 2,
              top: measurement.top + measurement.height / 2,
              backgroundColor: measurement.up ? UP_COLOR : DOWN_COLOR,
            }}
          >
            <div className="text-sm font-semibold leading-tight">
              {measurement.pctText}
            </div>
            <div className="text-xs leading-tight opacity-90">
              {measurement.priceText}
            </div>
            <div className="text-xs leading-tight opacity-90">
              {measurement.bars} bars · {measurement.daysText}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Live trading chart: the shared view fed by the websocket candle stream.
 */
export function PriceChart({
  network,
  coin,
  interval,
  priceLines = [],
  markers = [],
  indicators = [],
  onLineDragEnd,
  onChartContextMenu,
}: {
  network: TradingNetwork
  coin: string
  interval: CandleInterval
  priceLines?: ChartPriceLine[]
  /** Buy/sell arrows at fill times. */
  markers?: ChartMarker[]
  /** Technical-indicator overlays and oscillator sub-panes. */
  indicators?: IndicatorConfig[]
  /** Fired when a draggable price line is dropped at a new price. */
  onLineDragEnd?: (id: string, price: number) => void
  /** Fired on right-click with the price under the cursor. */
  onChartContextMenu?: (price: number, clientX: number, clientY: number) => void
}) {
  const maxCandles = useShellRuntime().config.maxCandles
  const { candles, loading } = useCandles(network, coin, interval, maxCandles)

  return (
    <PriceChartView
      candles={candles}
      loading={loading}
      coin={coin}
      dataKey={`${network}:${coin}:${interval}`}
      priceLines={priceLines}
      markers={markers}
      indicators={indicators}
      onLineDragEnd={onLineDragEnd}
      onChartContextMenu={onChartContextMenu}
    />
  )
}

function toCandleData(candle: ChartCandle): CandlestickData {
  return {
    time: (candle.t / 1000) as UTCTimestamp,
    open: Number(candle.o),
    high: Number(candle.h),
    low: Number(candle.l),
    close: Number(candle.c),
  }
}

function toVolumeData(candle: ChartCandle): HistogramData {
  return {
    time: (candle.t / 1000) as UTCTimestamp,
    value: Number(candle.v),
    color: Number(candle.c) >= Number(candle.o) ? UP_VOLUME : DOWN_VOLUME,
  }
}

/** Days label for the measure tool: finer precision for shorter spans. */
function formatDays(days: number): string {
  let decimals = 0
  if (days < 1) decimals = 2
  else if (days < 10) decimals = 1
  return `${days.toFixed(decimals)}d`
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
