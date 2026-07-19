import * as React from "react"
import { XIcon } from "lucide-react"
import type {
  CandlestickData,
  HistogramData,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineData,
  Logical,
  SeriesDefinition,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts"

import { ChartDrawToolbar } from "@/components/chart/chart-draw-toolbar"
import {
  configOverlays,
  EMPTY_STRATEGY_OVERLAYS,
  outputToOverlays,
} from "@/components/chart/indicator-overlays"
import {
  CHART_DOWN_COLOR as DOWN_COLOR,
  CHART_UP_COLOR as UP_COLOR,
  toNativeSignalMarkers,
  type ChartMarker,
} from "@/components/chart/chart-markers"
import {
  DEFAULT_TRENDLINE_COLOR,
  distanceToSegment,
  moveTrendlinePoint,
  nearestCandleTime,
  type PixelPoint,
  type Trendline,
  type TrendlinePoint,
} from "@/lib/trading/trendlines"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover"
import { ChartLoadingSkeleton } from "@/components/loading-skeleton"
import { useChartTrendlines } from "@/components/chart/use-chart-trendlines"
import { INDICATORS } from "@/lib/indicators/registry"
import { useShellRuntime } from "@/components/shell-layout"
import { candleIntervalMs, useCandles } from "@/lib/hl/hooks"
import { loadOlderHlCandles } from "@/lib/api/hl-candles"
import type { TradingNetwork } from "@/lib/hl/network"
import type { CandleInterval } from "@/lib/hl/ws"
import type { AutomationConfig } from "@/lib/strategies/strategy-config"
import {
  bollinger,
  ema,
  macd,
  qflBase,
  rsi,
} from "@/lib/strategies/indicators"
import {
  bollingerChartToModuleParams,
  emaLines,
  fairValueGapChartToModuleParams,
  indicatorColor,
  OSCILLATORS,
  priceActionChartToModuleParams,
  qqeChartToModuleParams,
  trendlineChartToModuleParams,
  type IndicatorConfig,
} from "@/lib/trading/indicators-config"
import { sessionsInRange } from "@/lib/trading/sessions"

// Trading-domain polarity convention (TradingView standard pair): up/down
// hues separated in lightness so direction survives CVD; everything else on
// the chart stays in recessive text/border tokens.
const UP_VOLUME = "rgba(8, 153, 129, 0.35)"
const DOWN_VOLUME = "rgba(242, 54, 69, 0.35)"
const MEASURE_UP_FILL = "rgba(8, 153, 129, 0.15)"
const MEASURE_DOWN_FILL = "rgba(242, 54, 69, 0.15)"
/** Pulsing pointer that locates a focused trade's entry/exit on the chart. */
const FOCUS_COLOR = "#2962ff"
const TRENDLINE_COLORS = [
  "#2962ff",
  "#089981",
  "#f23645",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
] as const
const EMPTY_TRENDLINES: Trendline[] = []
/** Stable default so the pointer effect doesn't re-run for unfocused charts. */
const EMPTY_FOCUS_POINTS: ChartFocusPoint[] = []

// lightweight-charts sizes fill-arrow markers from bar spacing with these
// rounding rules; we mirror them so a focus ring centers on the arrow at any
// zoom. See its series-markers geometry.
const ceiledOdd = (x: number) => {
  const c = Math.ceil(x)
  return c % 2 === 0 ? c - 1 : c
}
const ceiledEven = (x: number) => {
  const c = Math.ceil(x)
  return c % 2 !== 0 ? c - 1 : c
}
/** Half an arrow marker's height for a given bar spacing (its offset off the bar). */
const halfArrowHeight = (barSpacing: number) =>
  ceiledEven(ceiledOdd(Math.min(Math.max(barSpacing, 12), 30))) / 2
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

export type { ChartMarker } from "@/components/chart/chart-markers"

/** Imperative handle a parent can grab to drive the chart (e.g. Reset View). */
export type PriceChartHandle = {
  /** Re-frame the chart to its default view and re-enable price auto-scaling. */
  resetView: () => void
}

/** A fill pulsed on the chart to locate a focused trade among the markers. */
export type ChartFocusPoint = {
  /** Fill time, ms epoch — aligns with the trade's buy/sell marker. */
  time: number
  /** Matches the arrow at this fill: buys sit below the bar, sells above. */
  side: "buy" | "sell"
  label: string
  /** Exact fill price — centers the ring on the price-pinned chip when set. */
  price?: number
}

/**
 * Result readout drawn as a filled box spanning a focused trade's entry → exit
 * (like the measure tool, but sourced from a clicked trade instead of a drag).
 */
export type ChartFocusResult = {
  /** Winning trade → green box, losing → red. */
  up: boolean
  /** Return on entry notional, e.g. "-2.66%". */
  pctText: string
  /** Net realized P&L, e.g. "-$1.96". */
  pnlText: string
  bars: number
  daysText: string
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

/** Filled rectangle between two prices over a time span (e.g. a consolidation zone). */
export type ChartZone = {
  id: string
  fromMs: number
  toMs: number
  top: number
  bottom: number
  /** rgba() fill; keep translucent so candles stay legible. */
  fillColor: string
  borderColor?: string
}

/** Per-bar candle recoloring keyed by candle open time (ms). */
export type ChartBarColor = {
  time: number
  color: string
  borderColor?: string
  wickColor?: string
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
const DRAG_START_PX = 3
/** After a drop, hold the line at its new price until the backend confirms. */
const DROP_HOLD_MS = 8_000
/**
 * Above this many trade chips inside the visible window they overlap into an
 * unreadable pile — and positioning that many DOM nodes every pan frame is what
 * grinds a multi-year backtest to a crawl. Past the cap we draw none; zooming in
 * brings them back once few enough are on screen to read.
 */
const MAX_VISIBLE_CHIPS = 300
const TRENDLINE_HIT_PX = 8

/**
 * Data-agnostic chart view shared by the live trading terminal and the
 * backtest workspace: candles + volume, indicator overlays and oscillator
 * sub-panes, price lines (draggable when asked), buy/sell markers, and the
 * shift-click measure tool. Feed it candles from any source.
 */
export function PriceChartView({
  candles,
  loading = false,
  dataKey = "static",
  priceLines = [],
  markers = [],
  indicators = [],
  overlayLines = [],
  zones = [],
  barColors = [],
  visibleStartMs,
  focusPoints = EMPTY_FOCUS_POINTS,
  focusResult = null,
  onCrosshairOhlc,
  onLineDragEnd,
  onLineClick,
  onLineCancel,
  onChartContextMenu,
  onVisibleRangeChange,
  registerApi,
  trendlines = EMPTY_TRENDLINES,
  onTrendlinesChange,
  onTrendlinesCommit,
}: {
  /** Candles to render, ascending by open time. */
  candles: ChartCandle[]
  loading?: boolean
  /** Identity of the candle series; a change forces a full data reset. */
  dataKey?: string
  priceLines?: ChartPriceLine[]
  /** Trade-fill chips and indicator signal arrows. */
  markers?: ChartMarker[]
  /** Technical-indicator overlays and oscillator sub-panes. */
  indicators?: IndicatorConfig[]
  /** Generic extra line series (e.g. strategy channels). */
  overlayLines?: ChartOverlayLine[]
  /** Filled rectangles (e.g. consolidation zones). */
  zones?: ChartZone[]
  /** Per-bar candle recoloring (e.g. QQE state); unlisted bars keep defaults. */
  barColors?: ChartBarColor[]
  /** Show from this time (ms) instead of fitting all content (hides warmup). */
  visibleStartMs?: number
  /** Points pulsed on the chart to locate a focused trade among the arrows. */
  focusPoints?: ChartFocusPoint[]
  /** Result box spanning the focused trade's entry → exit; null hides it. */
  focusResult?: ChartFocusResult | null
  /** Crosshair candle readout; null when the cursor leaves the chart. */
  onCrosshairOhlc?: (candle: ChartCandle | null) => void
  /** Fired when a draggable price line is dropped at a new price. */
  onLineDragEnd?: (id: string, price: number) => void
  /** Fired when a draggable price line is clicked without moving it. */
  onLineClick?: (id: string) => void
  /** Fired when the cancel button on a draggable price line is clicked. */
  onLineCancel?: (id: string) => void
  /** Fired on right-click with the price under the cursor. */
  onChartContextMenu?: (price: number, clientX: number, clientY: number) => void
  /**
   * Fired when the visible time range changes (pan/zoom), with the edges in
   * seconds. Lets a parent lazily load more history as the user scrolls back.
   */
  onVisibleRangeChange?: (fromSec: number, toSec: number) => void
  /**
   * Receives the chart's imperative handle (e.g. `resetView`) once mounted, and
   * null on unmount — lets a parent wire "Reset View" into its own menu.
   */
  registerApi?: (api: PriceChartHandle | null) => void
  /** Saved trendlines for this chart. */
  trendlines?: Trendline[]
  /** Updates the in-memory line set while drawing or dragging. */
  onTrendlinesChange?: (trendlines: Trendline[]) => void
  /** Persists a completed create, edit, or delete action. */
  onTrendlinesCommit?: (trendlines: Trendline[]) => void
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const lineCancelEnabled = Boolean(onLineCancel)
  const chartRef = React.useRef<IChartApi | null>(null)
  const candleSeriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeSeriesRef = React.useRef<ISeriesApi<"Histogram"> | null>(null)
  const seriesCtorsRef = React.useRef<{
    LineSeries: SeriesDefinition<"Line">
    HistogramSeries: SeriesDefinition<"Histogram">
    BaselineSeries: SeriesDefinition<"Baseline">
  } | null>(null)
  const indicatorSeriesRef = React.useRef<
    Map<
      string,
      { series: ISeriesApi<SeriesType>; recolor?: (isDark: boolean) => string }
    >
  >(new Map())
  const priceLineRefs = React.useRef<Map<string, IPriceLine>>(new Map())
  const signalMarkersPluginRef =
    React.useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const lineSpecsRef = React.useRef<Map<string, ChartPriceLine>>(new Map())
  const draggingRef = React.useRef<{
    id: string
    price: number
    startY: number
    moved: boolean
  } | null>(null)
  const recentDropsRef = React.useRef<
    Map<string, { price: number; until: number }>
  >(new Map())
  const lastTimeRef = React.useRef<number>(0)
  // Earliest loaded bar time + bar count, so a left-prepend (progressive history
  // loading) can be detected and the view preserved across it.
  const firstTimeRef = React.useRef<number>(0)
  const prevLenRef = React.useRef<number>(0)
  const dataKeyRef = React.useRef<string | null>(null)
  const candleByTimeRef = React.useRef<Map<number, ChartCandle>>(new Map())
  // One short line series per QFL base mark — separate series so marks never
  // connect to each other across the gaps between them.
  const baseSeriesRef = React.useRef<ISeriesApi<"Line">[]>([])
  const overlaySeriesRef = React.useRef<Map<string, ISeriesApi<"Line">>>(
    new Map()
  )
  // One 2-point baseline series per zone: the baseline fill only spans the
  // series' data range, so each paints exactly one rectangle.
  const zoneSeriesRef = React.useRef<ISeriesApi<SeriesType>[]>([])
  // The candle array from the previous data-effect run: lets us tell a real
  // candle tick/backfill (new reference) from a params-only recolor (same
  // candles, different bar colours).
  const prevCandlesRef = React.useRef<ChartCandle[] | null>(null)
  const [ready, setReady] = React.useState(false)
  const [focusPixels, setFocusPixels] = React.useState<
    { x: number; y: number; label: string; placement: "above" | "below" }[]
  >([])
  // Pixel positions of price-pinned open/close/flip chips, kept in sync with
  // pan/zoom/resize the same way the focus ring is.
  const [markerPixels, setMarkerPixels] = React.useState<
    {
      x: number
      y: number
      letter: string
      color: string
      textColor?: string
    }[]
  >([])
  const [lineActionPixels, setLineActionPixels] = React.useState<
    { id: string; y: number; right: number; color: string; title: string }[]
  >([])
  // Built-in right-click "Reset View" menu (viewport coords); only used when the
  // parent hasn't taken over the context menu with its own handler.
  const [resetMenu, setResetMenu] = React.useState<{
    x: number
    y: number
  } | null>(null)
  // Bumped to force the marker/focus overlays to re-pin after a change that
  // doesn't fire the time-range event on its own (e.g. Reset View re-fitting
  // the price axis), so chips don't float off their candles.
  const [overlayRevision, setOverlayRevision] = React.useState(0)
  const [measurement, setMeasurement] = React.useState<Measurement | null>(null)
  // The one-shot trendline tool, driven by the floating drawing toolbar below.
  const [trendlineDrawing, setTrendlineDrawing] = React.useState(false)
  const [priceAxisWidth, setPriceAxisWidth] = React.useState(0)
  const [trendlineDraft, setTrendlineDraft] = React.useState<Trendline | null>(
    null
  )
  const [selectedTrendline, setSelectedTrendline] = React.useState<
    string | null
  >(null)
  const [trendlineSettings, setTrendlineSettings] = React.useState<{
    id: string
    x: number
    y: number
  } | null>(null)
  const [trendlinePixels, setTrendlinePixels] = React.useState<
    {
      id: string
      start: PixelPoint
      end: PixelPoint
      color: string
      draft?: boolean
    }[]
  >([])
  const candleTimes = React.useMemo(
    () => candles.map((candle) => Math.floor(candle.t / 1000)),
    [candles]
  )
  const measuringRef = React.useRef<{
    startX: number
    startY: number
    startPrice: number
  } | null>(null)
  const measureLockedRef = React.useRef(false)
  const trendlinesRef = React.useRef(trendlines)
  const trendlineDraftRef = React.useRef(trendlineDraft)
  const trendlinePixelsRef = React.useRef(trendlinePixels)
  const selectedTrendlineRef = React.useRef(selectedTrendline)
  const trendlineDrawingRef = React.useRef(trendlineDrawing)
  const trendlineDragRef = React.useRef<{
    id: string
    endpoint: "start" | "end"
  } | null>(null)

  const dragEndRef = React.useRef(onLineDragEnd)
  const lineClickRef = React.useRef(onLineClick)
  const contextMenuRef = React.useRef(onChartContextMenu)
  const crosshairOhlcRef = React.useRef(onCrosshairOhlc)
  const trendlinesChangeRef = React.useRef(onTrendlinesChange)
  const trendlinesCommitRef = React.useRef(onTrendlinesCommit)
  const visibleRangeRef = React.useRef(onVisibleRangeChange)
  React.useEffect(() => {
    dragEndRef.current = onLineDragEnd
    lineClickRef.current = onLineClick
    contextMenuRef.current = onChartContextMenu
    crosshairOhlcRef.current = onCrosshairOhlc
    trendlinesChangeRef.current = onTrendlinesChange
    trendlinesCommitRef.current = onTrendlinesCommit
    visibleRangeRef.current = onVisibleRangeChange
  }, [
    onLineDragEnd,
    onLineClick,
    onChartContextMenu,
    onCrosshairOhlc,
    onTrendlinesChange,
    onTrendlinesCommit,
    onVisibleRangeChange,
  ])
  React.useLayoutEffect(() => {
    trendlineDrawingRef.current = trendlineDrawing
  }, [trendlineDrawing])
  React.useLayoutEffect(() => {
    trendlinesRef.current = trendlines
  }, [trendlines])

  // After the price axis re-fits on a later frame (Reset View, click-to-focus
  // pan), re-pin the chip/focus overlays so none are left floating off their
  // candles. Two frames covers the reflow and the following paint.
  const repinOverlaysAfterReflow = React.useCallback(() => {
    requestAnimationFrame(() => {
      setOverlayRevision((n) => n + 1)
      requestAnimationFrame(() => setOverlayRevision((n) => n + 1))
    })
  }, [])

  // Reset View: back to the chart's default zoom and scroll — the most recent
  // bars at a comfortable bar spacing — with price auto-scale switched back on
  // in case the user dragged the axis.
  const resetView = React.useCallback(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.timeScale().resetTimeScale()
    chart.priceScale("right").applyOptions({ autoScale: true })
    repinOverlaysAfterReflow()
  }, [repinOverlaysAfterReflow])

  // Hand the imperative API up so a parent can add "Reset View" to its own menu.
  React.useEffect(() => {
    if (!registerApi) return
    registerApi({ resetView })
    return () => registerApi(null)
  }, [registerApi, resetView])

  React.useEffect(() => {
    const chart = chartRef.current
    const container = containerRef.current
    if (!ready || !chart || !container) return
    chart.applyOptions({
      handleScroll: !trendlineDrawing,
      handleScale: !trendlineDrawing,
    })
    container.style.cursor = trendlineDrawing ? "crosshair" : ""
    if (!trendlineDrawing) {
      trendlineDraftRef.current = null
      const frame = requestAnimationFrame(() => setTrendlineDraft(null))
      return () => cancelAnimationFrame(frame)
    }
  }, [ready, trendlineDrawing])

  // Width of the right price axis, so the floating drawing toolbar can rest
  // beside the price labels instead of on top of them. It grows and shrinks
  // with the price magnitude (3800.00 vs 66400.00), not just on resize.
  React.useEffect(() => {
    const chart = chartRef.current
    const container = containerRef.current
    if (!ready || !chart || !container) return
    const sync = () => setPriceAxisWidth(chart.priceScale("right").width())
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(container)
    const timeScale = chart.timeScale()
    timeScale.subscribeVisibleTimeRangeChange(sync)
    return () => {
      observer.disconnect()
      timeScale.unsubscribeVisibleTimeRangeChange(sync)
    }
  }, [ready])

  // Close the built-in menu on Escape (outside clicks are caught by its overlay).
  React.useEffect(() => {
    if (!resetMenu) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setResetMenu(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [resetMenu])

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
        BaselineSeries,
      }) => {
        if (disposed || !container) return
        seriesCtorsRef.current = { LineSeries, HistogramSeries, BaselineSeries }

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
            rightOffset: 12,
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
        signalMarkersPluginRef.current = createSeriesMarkers(candleSeries, [], {
          autoScale: true,
          zOrder: "top",
        })
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
        const trendlinePoint = (event: MouseEvent): TrendlinePoint | null => {
          const timeScale = chart.timeScale()
          const x = paneX(event)
          const logical = timeScale.coordinateToLogical(x)
          let time = timeScale.coordinateToTime(x)
          const data = candleSeries.data()
          const last = data.length - 1
          if (time === null && logical !== null && logical > last && last > 0) {
            const lastTime = Number(data[last].time)
            const interval = lastTime - Number(data[last - 1].time)
            time = (lastTime + Math.round(logical - last) * interval) as UTCTimestamp
          }
          const price = candleSeries.coordinateToPrice(paneY(event))
          if (time === null || price === null || price <= 0) return null
          return { time: Number(time), price }
        }
        const trendlineHit = (
          point: PixelPoint
        ): { id: string; endpoint?: "start" | "end" } | null => {
          const selected = selectedTrendlineRef.current
          if (selected) {
            const pixels = trendlinePixelsRef.current.find(
              (line) => line.id === selected
            )
            if (pixels) {
              if (
                Math.hypot(
                  point.x - pixels.start.x,
                  point.y - pixels.start.y
                ) <= TRENDLINE_HIT_PX
              )
                return { id: selected, endpoint: "start" }
              if (
                Math.hypot(point.x - pixels.end.x, point.y - pixels.end.y) <=
                TRENDLINE_HIT_PX
              )
                return { id: selected, endpoint: "end" }
            }
          }
          for (const pixels of trendlinePixelsRef.current.toReversed()) {
            if (
              !pixels.draft &&
              distanceToSegment(point, pixels.start, pixels.end) <=
                TRENDLINE_HIT_PX
            ) {
              return { id: pixels.id }
            }
          }
          return null
        }

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
          if (trendlineDrawingRef.current) {
            const point = trendlinePoint(event)
            if (!point) return
            const draft = trendlineDraftRef.current
            if (!draft) {
              const next = {
                id: `trendline-${Date.now()}`,
                start: point,
                end: point,
                color: DEFAULT_TRENDLINE_COLOR,
              }
              trendlineDraftRef.current = next
              setTrendlineDraft(next)
            } else {
              const next = { ...draft, end: point }
              trendlinesRef.current = [...trendlinesRef.current, next]
              trendlinesChangeRef.current?.(trendlinesRef.current)
              trendlinesCommitRef.current?.(trendlinesRef.current)
              trendlineDraftRef.current = null
              setTrendlineDraft(null)
              selectedTrendlineRef.current = next.id
              setSelectedTrendline(next.id)
              trendlineDrawingRef.current = false
              chart.applyOptions({ handleScroll: true, handleScale: true })
              container.style.cursor = ""
              setTrendlineDrawing(false)
            }
            event.preventDefault()
            event.stopPropagation()
            return
          }
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
          const point = { x: paneX(event), y: paneY(event) }
          const trendHit = trendlineHit(point)
          if (trendHit) {
            selectedTrendlineRef.current = trendHit.id
            setSelectedTrendline(trendHit.id)
            if (trendHit.endpoint) {
              trendlineDragRef.current = {
                id: trendHit.id,
                endpoint: trendHit.endpoint,
              }
              chart.applyOptions({ handleScroll: false, handleScale: false })
            }
            event.preventDefault()
            event.stopPropagation()
            return
          }
          selectedTrendlineRef.current = null
          setSelectedTrendline(null)
          const id = hitTestLine(paneY(event))
          if (!id) return
          const line = priceLineRefs.current.get(id)
          if (!line) return
          draggingRef.current = {
            id,
            price: line.options().price,
            startY: paneY(event),
            moved: false,
          }
          chart.applyOptions({ handleScroll: false, handleScale: false })
          event.preventDefault()
          event.stopPropagation()
        }

        const onDoubleClick = (event: MouseEvent) => {
          if (event.button !== 0 || trendlineDrawingRef.current) return
          const hit = trendlineHit({ x: paneX(event), y: paneY(event) })
          if (!hit) return
          selectedTrendlineRef.current = hit.id
          setSelectedTrendline(hit.id)
          setTrendlineSettings({
            id: hit.id,
            x: paneX(event),
            y: paneY(event),
          })
          event.preventDefault()
          event.stopPropagation()
        }

        const onMouseMove = (event: MouseEvent) => {
          if (trendlineDrawingRef.current) {
            const draft = trendlineDraftRef.current
            const point = trendlinePoint(event)
            if (draft && point) {
              const next = { ...draft, end: point }
              trendlineDraftRef.current = next
              setTrendlineDraft(next)
            }
            container.style.cursor = "crosshair"
            event.preventDefault()
            return
          }
          const trendlineDrag = trendlineDragRef.current
          if (trendlineDrag) {
            const point = trendlinePoint(event)
            if (point) {
              trendlinesRef.current = trendlinesRef.current.map((line) =>
                line.id === trendlineDrag.id
                  ? moveTrendlinePoint(line, trendlineDrag.endpoint, point)
                  : line
              )
              trendlinesChangeRef.current?.(trendlinesRef.current)
            }
            event.preventDefault()
            return
          }
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
            if (!dragging.moved) {
              dragging.moved = Math.abs(y - dragging.startY) >= DRAG_START_PX
              if (!dragging.moved) {
                event.preventDefault()
                return
              }
            }
            const price = candleSeries.coordinateToPrice(y)
            if (price !== null && price > 0) {
              priceLineRefs.current.get(dragging.id)?.applyOptions({ price })
              dragging.price = price
              setLineActionPixels((current) =>
                current.map((action) =>
                  action.id === dragging.id ? { ...action, y } : action
                )
              )
            }
            event.preventDefault()
            return
          }
          const trendHit = trendlineHit({ x: paneX(event), y })
          container.style.cursor = trendHit
            ? trendHit.endpoint
              ? "move"
              : "pointer"
            : hitTestLine(y)
              ? "ns-resize"
              : ""
        }

        const endDrag = () => {
          if (trendlineDragRef.current) {
            trendlineDragRef.current = null
            chart.applyOptions({ handleScroll: true, handleScale: true })
            trendlinesCommitRef.current?.(trendlinesRef.current)
          }
          const dragging = draggingRef.current
          if (!dragging) return
          draggingRef.current = null
          chart.applyOptions({ handleScroll: true, handleScale: true })
          if (!dragging.moved) {
            lineClickRef.current?.(dragging.id)
            return
          }
          recentDropsRef.current.set(dragging.id, {
            price: dragging.price,
            until: Date.now() + DROP_HOLD_MS,
          })
          dragEndRef.current?.(dragging.id, dragging.price)
        }

        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key === "Escape") {
            setTrendlineSettings(null)
            clearMeasure()
            if (trendlineDrawingRef.current || trendlineDraftRef.current) {
              trendlineDrawingRef.current = false
              trendlineDraftRef.current = null
              setTrendlineDraft(null)
              chart.applyOptions({ handleScroll: true, handleScale: true })
              container.style.cursor = ""
              setTrendlineDrawing(false)
            } else {
              selectedTrendlineRef.current = null
              setSelectedTrendline(null)
            }
          }
          if (
            (event.key === "Delete" || event.key === "Backspace") &&
            selectedTrendlineRef.current
          ) {
            const selected = selectedTrendlineRef.current
            trendlinesRef.current = trendlinesRef.current.filter(
              (line) => line.id !== selected
            )
            trendlinesChangeRef.current?.(trendlinesRef.current)
            trendlinesCommitRef.current?.(trendlinesRef.current)
            selectedTrendlineRef.current = null
            setSelectedTrendline(null)
            setTrendlineSettings(null)
            event.preventDefault()
          }
        }

        const onContextMenu = (event: MouseEvent) => {
          event.preventDefault()
          // While the shift-click measure box is active, a right-click cancels
          // it instead of opening any menu.
          if (measuringRef.current) {
            clearMeasure()
            event.stopPropagation()
            return
          }
          if (trendlineDrawingRef.current) {
            trendlineDrawingRef.current = false
            trendlineDraftRef.current = null
            setTrendlineDraft(null)
            chart.applyOptions({ handleScroll: true, handleScale: true })
            container.style.cursor = ""
            setTrendlineDrawing(false)
            event.stopPropagation()
            return
          }
          // Parent owns the menu (e.g. the live chart's trading actions) → hand
          // it the price and let it render. Otherwise show our built-in menu.
          if (contextMenuRef.current) {
            const price = candleSeries.coordinateToPrice(paneY(event))
            if (price !== null && price > 0) {
              contextMenuRef.current(price, event.clientX, event.clientY)
              return
            }
            // No readable price under the cursor — still offer Reset View.
          }
          setResetMenu({ x: event.clientX, y: event.clientY })
        }

        let longPressTimer: ReturnType<typeof setTimeout> | null = null
        let longPressStart: { x: number; y: number } | null = null
        const cancelLongPress = () => {
          if (longPressTimer) clearTimeout(longPressTimer)
          longPressTimer = null
          longPressStart = null
        }
        const onTouchStart = (event: TouchEvent) => {
          if (event.touches.length !== 1 || !contextMenuRef.current) return
          const touch = event.touches[0]
          longPressStart = { x: touch.clientX, y: touch.clientY }
          longPressTimer = setTimeout(() => {
            const price = candleSeries.coordinateToPrice(
              touch.clientY - container.getBoundingClientRect().top
            )
            if (price !== null && price > 0) {
              contextMenuRef.current?.(price, touch.clientX, touch.clientY)
            }
            cancelLongPress()
          }, 600)
        }
        const onTouchMove = (event: TouchEvent) => {
          const touch = event.touches[0]
          if (
            !touch ||
            !longPressStart ||
            Math.hypot(
              touch.clientX - longPressStart.x,
              touch.clientY - longPressStart.y
            ) > 10
          ) {
            cancelLongPress()
          }
        }

        container.addEventListener("mousedown", onMouseDown, true)
        container.addEventListener("dblclick", onDoubleClick, true)
        container.addEventListener("mousemove", onMouseMove)
        container.addEventListener("mouseup", endDrag)
        container.addEventListener("mouseleave", endDrag)
        container.addEventListener("contextmenu", onContextMenu)
        container.addEventListener("touchstart", onTouchStart)
        container.addEventListener("touchmove", onTouchMove)
        container.addEventListener("touchend", cancelLongPress)
        container.addEventListener("touchcancel", cancelLongPress)
        window.addEventListener("keydown", onKeyDown)
        detachPointerHandlers = () => {
          container.removeEventListener("mousedown", onMouseDown, true)
          container.removeEventListener("dblclick", onDoubleClick, true)
          container.removeEventListener("mousemove", onMouseMove)
          container.removeEventListener("mouseup", endDrag)
          container.removeEventListener("mouseleave", endDrag)
          container.removeEventListener("contextmenu", onContextMenu)
          container.removeEventListener("touchstart", onTouchStart)
          container.removeEventListener("touchmove", onTouchMove)
          container.removeEventListener("touchend", cancelLongPress)
          container.removeEventListener("touchcancel", cancelLongPress)
          cancelLongPress()
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
          for (const {
            series,
            recolor,
          } of indicatorSeriesRef.current.values()) {
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
      signalMarkersPluginRef.current = null
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
    for (const candle of candles)
      byTime.set(Math.floor(candle.t / 1000), candle)
    candleByTimeRef.current = byTime

    const colorMap = barColors.length
      ? new Map(barColors.map((bar) => [Math.floor(bar.time / 1000), bar]))
      : undefined
    // A real candle tick/backfill hands us a NEW candle array; a params-only
    // recolor keeps the same candles but different bar colours. Only the latter
    // needs a full repaint — a tick (even one that flips the forming bar's
    // colour) updates just the last bar and keeps the user's view.
    const candlesChanged = prevCandlesRef.current !== candles
    prevCandlesRef.current = candles

    const last = candles[candles.length - 1]
    const isIncremental =
      candlesChanged &&
      dataKeyRef.current === dataKey &&
      lastTimeRef.current > 0 &&
      last.t >= lastTimeRef.current &&
      candles.length > 1 &&
      candles[0].t < lastTimeRef.current &&
      // A real tick adds at most a bar; a whole snapshot must re-set the data.
      candles.length <= prevLenRef.current + 2

    // Progressive history: same series, older candles prepended on the left.
    // Reset the data — repainting every bar — but keep the user's current view.
    const grewLeft =
      dataKeyRef.current === dataKey &&
      firstTimeRef.current > 0 &&
      candles[0].t < firstTimeRef.current &&
      last.t <= lastTimeRef.current

    if (grewLeft && prevLenRef.current >= 30) {
      const timeScale = chartRef.current?.timeScale()
      const before = timeScale?.getVisibleLogicalRange()
      const added = candles.length - prevLenRef.current
      candleSeries.setData(
        candles.map((candle) => toCandleData(candle, colorMap))
      )
      volumeSeries.setData(candles.map(toVolumeData))
      // Prepending N bars shifts every logical index by N; re-offset the view so
      // the same candles stay under the cursor (no jump while history streams in).
      if (before && added > 0) {
        timeScale?.setVisibleLogicalRange({
          from: before.from + added,
          to: before.to + added,
        })
      }
    } else if (isIncremental) {
      candleSeries.update(toCandleData(last, colorMap))
      volumeSeries.update(toVolumeData(last))
    } else {
      candleSeries.setData(
        candles.map((candle) => toCandleData(candle, colorMap))
      )
      volumeSeries.setData(candles.map(toVolumeData))
      if (visibleStartMs && visibleStartMs < last.t) {
        // Charts with an explicit window (backtest) frame to it.
        chartRef.current?.timeScale().setVisibleRange({
          from: (visibleStartMs / 1000) as UTCTimestamp,
          to: (last.t / 1000) as UTCTimestamp,
        })
      } else {
        // Live chart with no explicit window: frame to the default recent span
        // (the same view Reset View gives) rather than the whole loaded range,
        // which grows as older candles stream in on the background backfill.
        chartRef.current?.timeScale().resetTimeScale()
      }
    }
    dataKeyRef.current = dataKey
    lastTimeRef.current = last.t
    firstTimeRef.current = candles[0].t
    prevLenRef.current = candles.length
  }, [ready, candles, dataKey, visibleStartMs, barColors])

  // Report the visible time range to the parent (for lazy history loading).
  React.useEffect(() => {
    const chart = chartRef.current
    if (!ready || !chart) return
    const timeScale = chart.timeScale()
    const handler = () => {
      const cb = visibleRangeRef.current
      if (!cb) return
      const range = timeScale.getVisibleRange()
      if (range) cb(range.from as number, range.to as number)
    }
    timeScale.subscribeVisibleTimeRangeChange(handler)
    return () => timeScale.unsubscribeVisibleTimeRangeChange(handler)
  }, [ready])

  // Trendlines are stored in chart values (time + price) and projected back to
  // pixels whenever the user pans, zooms, resizes, or edits a point.
  React.useEffect(() => {
    const chart = chartRef.current
    const series = candleSeriesRef.current
    const container = containerRef.current
    if (!ready || !chart || !series || !container) return
    const timeScale = chart.timeScale()
    const recompute = () => {
      const next: {
        id: string
        start: PixelPoint
        end: PixelPoint
        color: string
        draft?: boolean
      }[] = []
      for (const line of [
        ...trendlines,
        ...(trendlineDraft ? [trendlineDraft] : []),
      ]) {
        const last = candleTimes.length - 1
        const lastTime = candleTimes[last]
        const interval = lastTime - candleTimes[last - 1]
        const [startX, endX] = [line.start, line.end].map((point) => {
          if (last > 0 && point.time > lastTime && interval > 0)
            return timeScale.logicalToCoordinate(
              (last + (point.time - lastTime) / interval) as Logical
            )
          const time = nearestCandleTime(candleTimes, point.time)
          return time === null
            ? null
            : timeScale.timeToCoordinate(time as UTCTimestamp)
        })
        const startY = series.priceToCoordinate(line.start.price)
        const endY = series.priceToCoordinate(line.end.price)
        if (
          startX === null ||
          endX === null ||
          startY === null ||
          endY === null
        )
          continue
        next.push({
          id: line.id,
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          color: line.color,
          draft: line === trendlineDraft,
        })
      }
      trendlinePixelsRef.current = next
      setTrendlinePixels(next)
    }
    const recomputeAfterWheel = () => requestAnimationFrame(recompute)
    recompute()
    timeScale.subscribeVisibleTimeRangeChange(recompute)
    const observer = new ResizeObserver(recompute)
    observer.observe(container)
    container.addEventListener("wheel", recomputeAfterWheel)
    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(recompute)
      observer.disconnect()
      container.removeEventListener("wheel", recomputeAfterWheel)
    }
  }, [ready, trendlines, trendlineDraft, overlayRevision, candleTimes])

  // Pan (without changing zoom) so a newly focused trade's pulsing pointer is
  // centered in view — the user's current zoom level is preserved.
  React.useEffect(() => {
    const chart = chartRef.current
    if (
      !ready ||
      !chart ||
      lastTimeRef.current === 0 ||
      focusPoints.length === 0
    )
      return
    const timeScale = chart.timeScale()
    const visible = timeScale.getVisibleRange()
    if (!visible) return
    const width = (visible.to as number) - (visible.from as number)
    const times = focusPoints.map((point) => point.time / 1000)
    const center = (Math.min(...times) + Math.max(...times)) / 2
    timeScale.setVisibleRange({
      from: (center - width / 2) as UTCTimestamp,
      to: (center + width / 2) as UTCTimestamp,
    })
    // Panning re-fits the price axis a frame later — re-pin so the chips don't
    // float off their candles after a trade is clicked.
    repinOverlaysAfterReflow()
  }, [ready, focusPoints, repinOverlaysAfterReflow])

  // Track the pixel position of each focus point so the pulsing pointer stays
  // pinned to it as the user pans, zooms, or the pane resizes.
  React.useEffect(() => {
    const chart = chartRef.current
    const series = candleSeriesRef.current
    if (!ready || !chart || !series || focusPoints.length === 0) {
      setFocusPixels([])
      return
    }
    const timeScale = chart.timeScale()
    const recompute = () => {
      // Center the ring on the fill's arrow: buys draw below the bar, sells
      // above, each offset from the bar extreme by half the arrow height.
      const halfArrow = halfArrowHeight(timeScale.options().barSpacing)
      const next: {
        x: number
        y: number
        label: string
        placement: "above" | "below"
      }[] = []
      for (const point of focusPoints) {
        const sec = Math.floor(point.time / 1000)
        const x = timeScale.timeToCoordinate(sec as UTCTimestamp)
        const candle = candleByTimeRef.current.get(sec)
        if (x == null || !candle) continue
        const below = point.side === "buy"
        // Center on the price-pinned chip when a fill price is known; otherwise
        // fall back to the bar extreme plus the arrow offset (live orders).
        let y: number | null
        if (point.price != null) {
          y = series.priceToCoordinate(point.price)
        } else {
          const anchorPrice = Number(below ? candle.l : candle.h)
          const anchorY = series.priceToCoordinate(anchorPrice)
          y =
            anchorY == null
              ? null
              : below
                ? anchorY + halfArrow
                : anchorY - halfArrow
        }
        if (y == null) continue
        next.push({
          x,
          y,
          label: point.label,
          placement: below ? "below" : "above",
        })
      }
      setFocusPixels(next)
    }
    recompute()
    timeScale.subscribeVisibleTimeRangeChange(recompute)
    const observer = new ResizeObserver(recompute)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(recompute)
      observer.disconnect()
    }
  }, [ready, focusPoints, overlayRevision])

  React.useEffect(() => {
    const plugin = signalMarkersPluginRef.current
    if (!ready || !plugin) return
    plugin.setMarkers(toNativeSignalMarkers(markers))
  }, [ready, markers])

  // Pin each open/close/flip chip to its exact fill price on the
  // candle, re-projecting on pan/zoom/resize and dropping any that scroll off
  // screen so the DOM only ever holds the chips currently visible.
  // Sorted by time so the chips inside any visible window are one contiguous
  // slice we can binary-search to, instead of scanning every trade each frame.
  const pricedMarkers = React.useMemo(
    () =>
      markers.filter((marker) => marker.letter).sort((a, b) => a.time - b.time),
    [markers]
  )
  React.useEffect(() => {
    const chart = chartRef.current
    const series = candleSeriesRef.current
    if (!ready || !chart || !series || pricedMarkers.length === 0) {
      setMarkerPixels([])
      return
    }
    const timeScale = chart.timeScale()
    const recompute = () => {
      const range = timeScale.getVisibleRange()
      if (!range) {
        setMarkerPixels([])
        return
      }
      // Only the trades whose time falls inside the visible window; the rest
      // are off-screen and don't need positioning this frame.
      const fromMs = (range.from as number) * 1000
      const toMs = (range.to as number) * 1000
      const start = lowerBoundByTime(pricedMarkers, fromMs)
      const end = upperBoundByTime(pricedMarkers, toMs)
      if (end - start > MAX_VISIBLE_CHIPS) {
        setMarkerPixels([])
        return
      }
      const width = timeScale.width()
      const next: {
        x: number
        y: number
        letter: string
        color: string
        textColor?: string
      }[] = []
      for (let i = start; i < end; i += 1) {
        const marker = pricedMarkers[i]
        const sec = Math.floor(marker.time / 1000)
        const x = timeScale.timeToCoordinate(sec as UTCTimestamp)
        // Off-screen (or price out of the visible scale) → don't render it.
        if (x == null || x < 0 || x > width) continue
        const y = series.priceToCoordinate(marker.price as number)
        if (y == null) continue
        next.push({
          x,
          y,
          letter: marker.letter as string,
          color:
            marker.color ?? (marker.side === "buy" ? UP_COLOR : DOWN_COLOR),
          textColor: marker.textColor,
        })
      }
      // Declutter: chips landing on the same spot (e.g. a scale-in landing on a
      // close) would stack. Nudge each colliding chip right so they sit side by
      // side; the y (fill price) stays exact, only the x drifts.
      const STEP = 16 // chip width (12px) + a small gap
      // Break same-candle ties by what happened, not by price: the close (C)
      // comes before any re-open (O). Otherwise the left-right order flips on
      // tiny fill-price differences.
      const rank = (c: { letter: string }) => (c.letter === "C" ? 0 : 1)
      next.sort((a, b) => a.x - b.x || rank(a) - rank(b) || a.y - b.y)
      const placed: { x: number; y: number }[] = []
      for (const chip of next) {
        let guard = 0
        while (
          guard < 20 &&
          placed.some(
            (p) =>
              Math.abs(p.x - chip.x) < STEP && Math.abs(p.y - chip.y) < STEP
          )
        ) {
          chip.x += STEP
          guard += 1
        }
        placed.push({ x: chip.x, y: chip.y })
      }
      setMarkerPixels(next)
    }
    recompute()
    timeScale.subscribeVisibleTimeRangeChange(recompute)
    const observer = new ResizeObserver(recompute)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(recompute)
      observer.disconnect()
    }
  }, [ready, pricedMarkers, overlayRevision])

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
        // Up to three lines from one config, each with its own color; the
        // legacy single `color` still tints line 1 when no per-line color set.
        for (const line of emaLines(ind.params)) {
          addLine(
            `${ind.id}:${line.slot}`,
            line.slot,
            ind.colors?.[line.key] ??
              (line.key === "fast" ? ind.color : undefined),
            0
          )
        }
      } else if (ind.type === "base") {
        // Rendered as separate per-mark series in the data effect below.
      } else if (ind.type === "bollinger") {
        addLine("bollinger-upper", "bollinger-band", undefined, 0, { width: 1 })
        addLine("bollinger-mid", "bollinger-mid", ind.color, 0, {
          dashed: true,
        })
        addLine("bollinger-lower", "bollinger-band", undefined, 0, { width: 1 })
      } else if (ind.type === "rsi") {
        const series = addLine("rsi", "rsi", ind.color, paneOf(ind.id))
        for (const level of [
          ind.params.overbought ?? 70,
          ind.params.oversold ?? 30,
        ]) {
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

  // Filled zone rectangles: a 2-point baseline series fills from `top` down
  // to `baseValue.price = bottom` across exactly the zone's time span.
  React.useEffect(() => {
    const chart = chartRef.current
    const ctors = seriesCtorsRef.current
    if (!ready || !chart || !ctors) return

    for (const series of zoneSeriesRef.current) chart.removeSeries(series)
    zoneSeriesRef.current = []

    for (const zone of zones) {
      if (!(zone.top > zone.bottom) || !(zone.toMs > zone.fromMs)) continue
      const series = chart.addSeries(
        ctors.BaselineSeries,
        {
          baseValue: { type: "price", price: zone.bottom },
          topFillColor1: zone.fillColor,
          topFillColor2: zone.fillColor,
          topLineColor: zone.borderColor ?? "transparent",
          bottomFillColor1: "transparent",
          bottomFillColor2: "transparent",
          bottomLineColor: "transparent",
          lineWidth: 1,
          lineVisible: Boolean(zone.borderColor),
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        0
      )
      series.setData([
        { time: (zone.fromMs / 1000) as UTCTimestamp, value: zone.top },
        { time: (zone.toMs / 1000) as UTCTimestamp, value: zone.top },
      ])
      zoneSeriesRef.current.push(series)
      // The baseline series can only stroke its top edge, so a bordered box
      // gets its bottom edge from a separate 2-point line at `bottom`.
      if (zone.borderColor) {
        const bottomEdge = chart.addSeries(
          ctors.LineSeries,
          {
            color: zone.borderColor,
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          },
          0
        )
        bottomEdge.setData([
          { time: (zone.fromMs / 1000) as UTCTimestamp, value: zone.bottom },
          { time: (zone.toMs / 1000) as UTCTimestamp, value: zone.bottom },
        ])
        zoneSeriesRef.current.push(bottomEdge)
      }
    }
  }, [ready, zones])

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
        if (!Number.isNaN(values[i]))
          data.push({ time: at(i), value: values[i] })
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
        for (const line of emaLines(ind.params)) {
          setLine(`${ind.id}:${line.slot}`, ema(closes, ind.params[line.periodKey]))
        }
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
      // Cancelable lines render their label as an HTML chip (with the ×)
      // pinned to the line, so the canvas title stays empty — the library
      // shifts its title chip to dodge axis labels, which would desync it
      // from the overlaid button.
      const title = lineCancelEnabled && spec.draggable ? "" : spec.title
      if (current) {
        current.applyOptions({
          price,
          color: spec.color,
          title,
        })
      } else {
        existing.set(
          spec.id,
          candleSeries.createPriceLine({
            price,
            color: spec.color,
            title,
            lineWidth: spec.lineWidth ?? (spec.draggable ? 2 : 1),
            lineStyle: spec.lineStyle === "solid" ? 0 : 2,
            axisLabelVisible: spec.axisLabelVisible ?? true,
          })
        )
      }
    }
  }, [ready, priceLines, lineCancelEnabled])

  React.useEffect(() => {
    const chart = chartRef.current
    const series = candleSeriesRef.current
    const container = containerRef.current
    const lines = lineCancelEnabled
      ? priceLines.filter((line) => line.draggable)
      : []
    if (!ready || !chart || !series || !container || lines.length === 0) {
      setLineActionPixels([])
      return
    }

    const timeScale = chart.timeScale()
    const recompute = () => {
      const right = Math.max(container.clientWidth - timeScale.width(), 0)
      setLineActionPixels(
        lines.flatMap((spec) => {
          const price =
            priceLineRefs.current.get(spec.id)?.options().price ?? spec.price
          const y = series.priceToCoordinate(price)
          return y === null || y < 0 || y > container.clientHeight
            ? []
            : [{ id: spec.id, y, right, color: spec.color, title: spec.title }]
        })
      )
    }
    const recomputeAfterWheel = () => requestAnimationFrame(recompute)
    recompute()
    timeScale.subscribeVisibleTimeRangeChange(recompute)
    const observer = new ResizeObserver(recompute)
    observer.observe(container)
    container.addEventListener("wheel", recomputeAfterWheel)
    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(recompute)
      observer.disconnect()
      container.removeEventListener("wheel", recomputeAfterWheel)
    }
  }, [ready, priceLines, lineCancelEnabled, overlayRevision])

  // Bounding box of the focused trade's entry + exit pixels, so the result box
  // spans from one to the other. Only when both are on screen (the focus effect
  // pans them into view together).
  const focusBox =
    focusResult && focusPixels.length >= 2
      ? {
          left: Math.min(...focusPixels.map((p) => p.x)),
          right: Math.max(...focusPixels.map((p) => p.x)),
          top: Math.min(...focusPixels.map((p) => p.y)),
          bottom: Math.max(...focusPixels.map((p) => p.y)),
        }
      : null

  const settingsTrendline = trendlineSettings
    ? trendlines.find((line) => line.id === trendlineSettings.id)
    : null
  const updateTrendlineColor = (color: string) => {
    if (!trendlineSettings) return
    const next = trendlinesRef.current.map((line) =>
      line.id === trendlineSettings.id ? { ...line, color } : line
    )
    trendlinesRef.current = next
    trendlinesChangeRef.current?.(next)
    trendlinesCommitRef.current?.(next)
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {loading && candles.length === 0 ? <ChartLoadingSkeleton /> : null}
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
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded px-2 py-1 text-center whitespace-nowrap text-white shadow-md"
            style={{
              left: measurement.left + measurement.width / 2,
              top: measurement.top + measurement.height / 2,
              backgroundColor: measurement.up ? UP_COLOR : DOWN_COLOR,
            }}
          >
            <div className="text-sm leading-tight font-semibold">
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
      {trendlinePixels.length > 0 ? (
        <svg
          className="pointer-events-none absolute inset-0 z-30 h-full w-full text-foreground"
          aria-label="Chart trendlines"
        >
          {trendlinePixels.map((line) => {
            const selected = line.id === selectedTrendline
            const color = line.color
            return (
              <g key={line.id} data-trendline-id={line.id}>
                <line
                  x1={line.start.x}
                  y1={line.start.y}
                  x2={line.end.x}
                  y2={line.end.y}
                  stroke={color}
                  strokeWidth={selected ? 3 : 2}
                  strokeDasharray={line.draft ? "5 4" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                {selected ? (
                  <>
                    <circle
                      cx={line.start.x}
                      cy={line.start.y}
                      r={4}
                      fill="var(--card)"
                      stroke={color}
                      strokeWidth={2}
                    />
                    <circle
                      cx={line.end.x}
                      cy={line.end.y}
                      r={4}
                      fill="var(--card)"
                      stroke={color}
                      strokeWidth={2}
                    />
                  </>
                ) : null}
              </g>
            )
          })}
        </svg>
      ) : null}
      {/* Only charts that can store what you draw get the tools, and only once
          the price axis has been measured so the bar doesn't jump into place. */}
      {ready && onTrendlinesCommit ? (
        <ChartDrawToolbar
          priceAxisWidth={priceAxisWidth}
          trendlineActive={trendlineDrawing}
          onTrendlineToggle={() => setTrendlineDrawing((active) => !active)}
        />
      ) : null}
      <Popover
        open={Boolean(trendlineSettings && settingsTrendline)}
        onOpenChange={(open) => {
          if (!open) setTrendlineSettings(null)
        }}
      >
        {trendlineSettings && settingsTrendline ? (
          <>
            <PopoverAnchor asChild>
              <span
                className="pointer-events-none absolute z-40 size-px"
                style={{ left: trendlineSettings.x, top: trendlineSettings.y }}
              />
            </PopoverAnchor>
            <PopoverContent className="w-56" side="top" align="center">
              <PopoverHeader>
                <PopoverTitle>Trendline settings</PopoverTitle>
              </PopoverHeader>
              <div className="grid gap-2.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Color
                </span>
                <div className="grid grid-cols-6 gap-2">
                  {TRENDLINE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Set trendline color to ${color}`}
                      aria-pressed={settingsTrendline.color === color}
                      className="size-6 rounded-full border border-foreground/15 ring-offset-2 transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-ring"
                      style={{ backgroundColor: color }}
                      onClick={() => updateTrendlineColor(color)}
                    />
                  ))}
                </div>
                <label className="flex cursor-pointer items-center justify-between rounded-md border border-border px-2 py-1.5 text-xs">
                  Custom
                  <input
                    type="color"
                    aria-label="Custom trendline color"
                    className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                    value={settingsTrendline.color}
                    onChange={(event) =>
                      updateTrendlineColor(event.target.value)
                    }
                  />
                </label>
              </div>
            </PopoverContent>
          </>
        ) : null}
      </Popover>
      {markerPixels.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          {markerPixels.map((m, i) => {
            const ring = 13
            const dot = 12
            return (
              <div
                key={`${m.letter}-${m.x}-${m.y}-${i}`}
                className="absolute"
                style={{ left: m.x, top: m.y, width: 0, height: 0 }}
              >
                {/* Animated chip: a glowing dot (O = open, C = close, F = flip)
                    ringed by two radar waves, staggered by half a cycle. Color
                    carries the side: green = long, red = short, yellow = flip. */}
                <span
                  className="absolute rounded-full border-2"
                  style={{
                    left: 0,
                    top: 0,
                    width: ring,
                    height: ring,
                    margin: `${-ring / 2}px 0 0 ${-ring / 2}px`,
                    borderColor: m.color,
                    animation: "chip-ring 1.3s ease-out infinite",
                  }}
                />
                <span
                  className="absolute rounded-full border-2"
                  style={{
                    left: 0,
                    top: 0,
                    width: ring,
                    height: ring,
                    margin: `${-ring / 2}px 0 0 ${-ring / 2}px`,
                    borderColor: m.color,
                    animation: "chip-ring 1.3s ease-out infinite 0.65s",
                  }}
                />
                <span
                  className="absolute flex items-center justify-center rounded-full leading-none font-bold"
                  style={{
                    left: 0,
                    top: 0,
                    width: dot,
                    height: dot,
                    margin: `${-dot / 2}px 0 0 ${-dot / 2}px`,
                    fontSize: 8,
                    backgroundColor: m.color,
                    color: m.textColor ?? "#fff",
                    boxShadow: `0 0 6px ${m.color}`,
                    animation: "chip-dot 1.3s ease-in-out infinite",
                  }}
                >
                  {m.letter}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
      {focusPixels.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
          {focusPixels.map((point) => (
            <div
              key={point.label}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: point.x, top: point.y }}
            >
              {/* Hollow pulsing rings encircle the fill's arrow without hiding it. */}
              <span
                className="absolute top-1/2 left-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2"
                style={{ borderColor: FOCUS_COLOR }}
              />
              <span
                className="absolute top-1/2 left-1/2 block h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                style={{ borderColor: FOCUS_COLOR }}
              />
              <span
                className={`absolute left-1/2 -translate-x-1/2 rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white shadow ${
                  point.placement === "below"
                    ? "top-full mt-1"
                    : "bottom-full mb-1"
                }`}
                style={{ backgroundColor: FOCUS_COLOR }}
              >
                {point.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {focusBox && focusResult ? (
        <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
          <div
            className="absolute border"
            style={{
              left: focusBox.left,
              top: focusBox.top,
              width: focusBox.right - focusBox.left,
              height: focusBox.bottom - focusBox.top,
              backgroundColor: focusResult.up
                ? MEASURE_UP_FILL
                : MEASURE_DOWN_FILL,
              borderColor: focusResult.up ? UP_COLOR : DOWN_COLOR,
            }}
          />
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded px-2 py-1 text-center whitespace-nowrap text-white shadow-md"
            style={{
              left: (focusBox.left + focusBox.right) / 2,
              top: (focusBox.top + focusBox.bottom) / 2,
              backgroundColor: focusResult.up ? UP_COLOR : DOWN_COLOR,
            }}
          >
            <div className="text-sm leading-tight font-semibold">
              {focusResult.pctText}
            </div>
            <div className="text-xs leading-tight opacity-90">
              {focusResult.pnlText}
            </div>
            <div className="text-xs leading-tight opacity-90">
              {focusResult.bars} bars · {focusResult.daysText}
            </div>
          </div>
        </div>
      ) : null}
      {onLineCancel
        ? lineActionPixels.map((action) => (
            <div
              key={action.id}
              className="pointer-events-none absolute z-40 flex -translate-y-1/2 items-center gap-0.5 rounded-l-sm py-px pl-1.5 text-[11px] font-medium text-white shadow-sm"
              style={{
                top: action.y,
                right: action.right,
                backgroundColor: action.color,
              }}
            >
              <span className="whitespace-nowrap">{action.title}</span>
              <button
                type="button"
                aria-label={`Cancel ${action.title}`}
                className="pointer-events-auto flex size-4 items-center justify-center outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                onClick={() => onLineCancel(action.id)}
              >
                <XIcon className="size-3" aria-hidden="true" />
              </button>
            </div>
          ))
        : null}
      {resetMenu ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setResetMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault()
              setResetMenu(null)
            }}
          />
          <div
            className="fixed z-50 min-w-40 rounded-md border bg-popover p-1 text-sm shadow-md"
            style={{
              left: Math.min(resetMenu.x, window.innerWidth - 180),
              top: Math.min(resetMenu.y, window.innerHeight - 80),
            }}
          >
            <button
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left hover:bg-accent"
              onClick={() => {
                resetView()
                setResetMenu(null)
              }}
            >
              Reset View
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Session shading: menu swatches are hex; the zone fill needs translucent rgba. */
const SESSION_FILL_ALPHA = 0.2
const SESSION_BORDER_ALPHA = 0.55
const EMPTY_ZONES: ChartZone[] = []

/**
 * Keeps the SAME array reference while the content is unchanged, so downstream
 * effects that compare props by reference (the candle series' `barColors`
 * recolor check) don't fire on every render. An indicator recompute produces a
 * fresh array each tick even when the bar colours are identical — this collapses
 * that back to a stable reference.
 */
function useStableBarColors(next: ChartBarColor[]): ChartBarColor[] {
  const ref = React.useRef(next)
  const prev = ref.current
  const same =
    prev.length === next.length &&
    next.every(
      (bar, i) => bar.time === prev[i].time && bar.color === prev[i].color
    )
  if (same) return prev
  ref.current = next
  return next
}
function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return `rgba(41, 98, 255, ${alpha})`
  const value = parseInt(match[1], 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
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
  automationConfig,
  focusPoints,
  focusResult,
  onCrosshairOhlc,
  onLineDragEnd,
  onLineClick,
  onLineCancel,
  onChartContextMenu,
  onCandlesChange,
  registerApi,
  onTrendlinePersistenceError,
}: {
  network: TradingNetwork
  coin: string
  interval: CandleInterval
  priceLines?: ChartPriceLine[]
  /** Buy/sell arrows at fill times. */
  markers?: ChartMarker[]
  /** Technical-indicator overlays and oscillator sub-panes. */
  indicators?: IndicatorConfig[]
  /** Full saved config paint (an Automation's connected-indicator lines). */
  automationConfig?: AutomationConfig | null
  /** Pulse rings the chart pans to (e.g. a selected fill). */
  focusPoints?: ChartFocusPoint[]
  /** Entry → exit result box for a focused round trip. */
  focusResult?: ChartFocusResult | null
  /**
   * Fired with the hovered candle; falls back to the latest candle when the
   * cursor leaves, so a toolbar readout always has something to show.
   */
  onCrosshairOhlc?: (candle: ChartCandle | null) => void
  /** Fired when a draggable price line is dropped at a new price. */
  onLineDragEnd?: (id: string, price: number) => void
  /** Fired when a draggable price line is clicked without moving it. */
  onLineClick?: (id: string) => void
  /** Fired when the cancel button on a draggable price line is clicked. */
  onLineCancel?: (id: string) => void
  /** Fired on right-click with the price under the cursor. */
  onChartContextMenu?: (price: number, clientX: number, clientY: number) => void
  /** Fired with the merged (history + live) candle window whenever it changes. */
  onCandlesChange?: (candles: ChartCandle[]) => void
  /** Receives the chart's imperative handle (e.g. `resetView`) once mounted. */
  registerApi?: (api: PriceChartHandle | null) => void
  onTrendlinePersistenceError?: (action: "load" | "save") => void
}) {
  const maxCandles = useShellRuntime().config.maxCandles
  const { candles: liveCandles, loading } = useCandles(
    network,
    coin,
    interval,
    maxCandles
  )

  // Scroll-back history: the websocket only carries a recent window; panning
  // near the left edge backfills older candles from the exchange (same
  // behavior the backtest chart has, cached per market+interval while
  // mounted). Cap keeps unbounded panning from hoarding memory.
  const HISTORY_CHUNK = 800
  const HISTORY_CAP = 6_000
  const dataKey = `${network}:${coin}:${interval}`
  const {
    trendlines: visibleTrendlines,
    onTrendlinesChange: handleTrendlinesChange,
    onTrendlinesCommit: handleTrendlinesCommit,
  } = useChartTrendlines({
    network,
    market: coin,
    onPersistenceError: onTrendlinePersistenceError,
  })
  const [history, setHistory] = React.useState<{
    key: string
    candles: ChartCandle[]
    exhausted: boolean
  }>({ key: dataKey, candles: [], exhausted: false })
  const historyLoadingRef = React.useRef(false)
  React.useEffect(() => {
    setHistory({ key: dataKey, candles: [], exhausted: false })
    historyLoadingRef.current = false
  }, [dataKey])

  const candles = React.useMemo(() => {
    const older =
      history.key === dataKey && history.candles.length > 0
        ? history.candles
        : []
    if (older.length === 0) return liveCandles
    const byTime = new Map<number, ChartCandle>()
    for (const candle of older) byTime.set(candle.t, candle)
    for (const candle of liveCandles) byTime.set(candle.t, candle)
    return [...byTime.values()].sort((a, b) => a.t - b.t)
  }, [liveCandles, history, dataKey])

  // Mirrors the merged candle window to the parent (e.g. the Automation
  // visualize panel derives its draggable price levels from it).
  React.useEffect(() => {
    onCandlesChange?.(candles)
  }, [candles, onCandlesChange])

  const handleVisibleRange = React.useCallback(
    (fromSec: number) => {
      const oldest = candles[0]?.t
      if (!oldest || historyLoadingRef.current) return
      if (history.exhausted || candles.length >= HISTORY_CAP) return
      // Start backfilling when the view's left edge nears the loaded floor.
      const bufferMs = 20 * candleIntervalMs(interval)
      if (fromSec * 1000 > oldest + bufferMs) return
      historyLoadingRef.current = true
      void loadOlderHlCandles({
        network,
        coin,
        interval,
        beforeMs: oldest,
        bars: HISTORY_CHUNK,
      })
        .then(({ candles: older }) => {
          setHistory((current) =>
            current.key === dataKey
              ? {
                  key: dataKey,
                  candles: [...older, ...current.candles],
                  exhausted: older.length === 0,
                }
              : current
          )
        })
        .catch(() => {
          // Backfill is best-effort; the live window keeps working.
        })
        .finally(() => {
          historyLoadingRef.current = false
        })
    },
    [candles, history.exhausted, dataKey, network, coin, interval]
  )

  const strategy = React.useMemo(
    () =>
      automationConfig
        ? configOverlays(automationConfig, candles)
        : EMPTY_STRATEGY_OVERLAYS,
    [candles, automationConfig]
  )

  // QQE is the one pinned chart indicator that renders through the shared
  // paint pipeline (bar-colors, chop zones, swing pivots) instead of a bespoke
  // series. Its buy/sell signals become native chart arrows whose tips stay
  // anchored to their exact signal price through chart reflow.
  const qqe = React.useMemo(() => {
    const cfg = indicators.find((ind) => ind.type === "qqe" && ind.enabled)
    if (!cfg || candles.length === 0) {
      return { overlayLines: [], zones: [], barColors: [], markers: [] }
    }
    const numeric = candles.map((c) => ({
      t: c.t,
      o: Number(c.o),
      h: Number(c.h),
      l: Number(c.l),
      c: Number(c.c),
      v: Number(c.v),
    }))
    const out = INDICATORS.qqe.compute(
      numeric,
      qqeChartToModuleParams(cfg.params) as never
    )
    const overlays = outputToOverlays(out)
    const closeAt = new Map(numeric.map((c) => [c.t, c.c]))
    const markers: ChartMarker[] = out.signals.flatMap((signal) => {
      const price = closeAt.get(signal.time)
      return price ? [{ time: signal.time, side: signal.side, price }] : []
    })
    return {
      overlayLines: overlays.overlayLines,
      zones: overlays.zones,
      barColors: overlays.barColors,
      markers,
    }
  }, [indicators, candles])

  // EMA cross arrows: when the EMA overlay has at least two lines switched
  // on, the two FASTEST fire a long (up) arrow when the faster crosses above
  // the slower and a short (down) arrow on the cross back — the same signal
  // the EMA Cross strategy trades, computed through the same module.
  const emaCrossMarkers = React.useMemo<ChartMarker[]>(() => {
    const cfg = indicators.find((ind) => ind.type === "ema" && ind.enabled)
    if (!cfg || candles.length === 0) return []
    const periods = emaLines(cfg.params)
      .map((line) => cfg.params[line.periodKey])
      .sort((a, b) => a - b)
    if (periods.length < 2) return []
    const [fast, slow] = periods
    if (fast === slow) return []
    const numeric = candles.map((c) => ({
      t: c.t,
      o: Number(c.o),
      h: Number(c.h),
      l: Number(c.l),
      c: Number(c.c),
      v: Number(c.v),
    }))
    const out = INDICATORS.ema_cross.compute(numeric, {
      fast,
      slow,
      third: slow,
      showFast: true,
      showSlow: true,
      showThird: false,
    } as never)
    const closeAt = new Map(numeric.map((c) => [c.t, c.c]))
    return out.signals.flatMap((signal) => {
      const price = closeAt.get(signal.time)
      return price ? [{ time: signal.time, side: signal.side, price }] : []
    })
  }, [indicators, candles])

  // Price Action arrows: each detected pattern prints a long (up) or short
  // (down) arrow at its candle — the same detector the Price Action strategy
  // trades, computed through the same module.
  const priceActionMarkers = React.useMemo<ChartMarker[]>(() => {
    const cfg = indicators.find(
      (ind) => ind.type === "priceAction" && ind.enabled
    )
    if (!cfg || candles.length === 0) return []
    const numeric = candles.map((c) => ({
      t: c.t,
      o: Number(c.o),
      h: Number(c.h),
      l: Number(c.l),
      c: Number(c.c),
      v: Number(c.v),
    }))
    const out = INDICATORS.price_action.compute(
      numeric,
      priceActionChartToModuleParams(cfg.params) as never
    )
    const closeAt = new Map(numeric.map((c) => [c.t, c.c]))
    return out.signals.flatMap((signal) => {
      const price = closeAt.get(signal.time)
      return price ? [{ time: signal.time, side: signal.side, price }] : []
    })
  }, [indicators, candles])

  // Fair Value Gap draws its imbalance boxes through the same zone pipeline as
  // QQE's chop zones. Per the "no signal arrows" rule its buy/sell aren't
  // painted here — the boxes are the visual.
  const fvg = React.useMemo(() => {
    const cfg = indicators.find(
      (ind) => ind.type === "fairValueGap" && ind.enabled
    )
    if (!cfg || candles.length === 0) return { zones: [] as ChartZone[] }
    const numeric = candles.map((c) => ({
      t: c.t,
      o: Number(c.o),
      h: Number(c.h),
      l: Number(c.l),
      c: Number(c.c),
      v: Number(c.v),
    }))
    const out = INDICATORS.fair_value_gap.compute(
      numeric,
      fairValueGapChartToModuleParams(cfg.params) as never
    )
    return { zones: outputToOverlays(out).zones }
  }, [indicators, candles])

  const trendline = React.useMemo(() => {
    const cfg = indicators.find(
      (ind) => ind.type === "trendline" && ind.enabled
    )
    if (!cfg || candles.length === 0) {
      return { overlayLines: [], markers: [] as ChartMarker[] }
    }
    const numeric = candles.map((c) => ({
      t: c.t,
      o: Number(c.o),
      h: Number(c.h),
      l: Number(c.l),
      c: Number(c.c),
      v: Number(c.v),
    }))
    const out = INDICATORS.trendline.compute(
      numeric,
      trendlineChartToModuleParams(cfg.params) as never
    )
    const closeAt = new Map(numeric.map((c) => [c.t, c.c]))
    const markers: ChartMarker[] = out.signals.flatMap((signal) => {
      const price = closeAt.get(signal.time)
      return price ? [{ time: signal.time, side: signal.side, price }] : []
    })
    return { overlayLines: outputToOverlays(out).overlayLines, markers }
  }, [indicators, candles])

  // Bollinger arrows: the bands themselves render from the chart's own
  // config; the buy/sell arrows come from the module so the chart marks
  // exactly what the Bollinger strategy node (same mode) would trade.
  const bollingerMarkers = React.useMemo<ChartMarker[]>(() => {
    const cfg = indicators.find(
      (ind) => ind.type === "bollinger" && ind.enabled
    )
    if (!cfg || candles.length === 0) return []
    const numeric = candles.map((c) => ({
      t: c.t,
      o: Number(c.o),
      h: Number(c.h),
      l: Number(c.l),
      c: Number(c.c),
      v: Number(c.v),
    }))
    const out = INDICATORS.bollinger.compute(
      numeric,
      bollingerChartToModuleParams(cfg.params) as never
    )
    const closeAt = new Map(numeric.map((c) => [c.t, c.c]))
    return out.signals.flatMap((signal) => {
      const price = closeAt.get(signal.time)
      return price ? [{ time: signal.time, side: signal.side, price }] : []
    })
  }, [indicators, candles])

  // Session shading: each picked session (NYSE, Tokyo, London, or a crypto
  // UTC block) paints as a translucent box from its open to its close,
  // bounded by that session's own high and low (like the measure tool's
  // result box). Zone identity is kept stable via the ref below so the series
  // only rebuild when a box actually changes (new bar, backfill, or a fresh
  // session extreme) — not on every tick.
  const sessionInd = indicators.find((ind) => ind.type === "session")
  const sessionEnabled = Boolean(sessionInd?.enabled)
  const sessionHex = sessionInd?.color ?? "#2962ff"
  const sessionKey = sessionInd?.session ?? "nyse"
  const sessionZonesRef = React.useRef<ChartZone[]>(EMPTY_ZONES)
  const sessionZones = React.useMemo<ChartZone[]>(() => {
    if (!sessionEnabled || candles.length === 0) return EMPTY_ZONES
    const firstMs = candles[0].t
    const lastMs = candles[candles.length - 1].t
    // Snap zone edges to candle boundaries: off-grid times would insert extra
    // slots into the index-based time axis. Coarse intervals can collapse
    // neighboring sessions together, so overlapping spans merge.
    const step = candleIntervalMs(interval)
    const spans: { fromMs: number; toMs: number }[] = []
    for (const session of sessionsInRange(sessionKey, firstMs, lastMs)) {
      const fromMs = Math.max(Math.floor(session.openMs / step) * step, firstMs)
      const toMs = Math.min(Math.ceil(session.closeMs / step) * step, lastMs)
      const prev = spans[spans.length - 1]
      if (prev && fromMs <= prev.toMs) prev.toMs = Math.max(prev.toMs, toMs)
      else spans.push({ fromMs, toMs })
    }
    // One pass for per-session extremes: candles and spans are both sorted.
    // A candle opening exactly at the close boundary is post-session, except
    // at the live edge where it's the session's forming bar.
    const fill = hexToRgba(sessionHex, SESSION_FILL_ALPHA)
    const border = hexToRgba(sessionHex, SESSION_BORDER_ALPHA)
    const next: ChartZone[] = []
    let index = 0
    for (const span of spans) {
      if (!(span.toMs > span.fromMs)) continue
      while (index < candles.length && candles[index].t < span.fromMs)
        index += 1
      let high = -Infinity
      let low = Infinity
      while (
        index < candles.length &&
        (candles[index].t < span.toMs ||
          (candles[index].t === span.toMs && span.toMs === lastMs))
      ) {
        const candleHigh = Number(candles[index].h)
        const candleLow = Number(candles[index].l)
        if (candleHigh > high) high = candleHigh
        if (candleLow < low) low = candleLow
        index += 1
      }
      if (!(high > low)) continue
      next.push({
        id: `session-${span.fromMs}`,
        fromMs: span.fromMs,
        toMs: span.toMs,
        top: high,
        bottom: low,
        fillColor: fill,
        borderColor: border,
      })
    }
    const prev = sessionZonesRef.current
    const unchanged =
      next.length === prev.length &&
      next.every((zone, i) => {
        const old = prev[i]
        return (
          zone.fromMs === old.fromMs &&
          zone.toMs === old.toMs &&
          zone.top === old.top &&
          zone.bottom === old.bottom &&
          zone.fillColor === old.fillColor &&
          zone.borderColor === old.borderColor
        )
      })
    if (unchanged) return prev
    sessionZonesRef.current = next
    return next
  }, [sessionEnabled, sessionHex, sessionKey, interval, candles])
  const zones = React.useMemo(
    () => [...strategy.zones, ...qqe.zones, ...fvg.zones, ...sessionZones],
    [strategy.zones, qqe.zones, fvg.zones, sessionZones]
  )
  // Content-stable so a live tick that doesn't change any bar colour doesn't
  // force the candle series to fully re-set (which would re-frame the chart).
  const barColors = useStableBarColors(
    React.useMemo(
      () => [...strategy.barColors, ...qqe.barColors],
      [strategy.barColors, qqe.barColors]
    )
  )

  // Readout parity with the backtest chart: while the cursor isn't on the
  // chart, the toolbar readout tracks the latest live candle.
  const hoveringRef = React.useRef(false)
  const crosshairRef = React.useRef(onCrosshairOhlc)
  React.useEffect(() => {
    crosshairRef.current = onCrosshairOhlc
  }, [onCrosshairOhlc])
  React.useEffect(() => {
    if (hoveringRef.current) return
    crosshairRef.current?.(candles[candles.length - 1] ?? null)
  }, [candles])

  return (
    <PriceChartView
      candles={candles}
      loading={loading}
      dataKey={`${network}:${coin}:${interval}`}
      priceLines={[...priceLines, ...strategy.priceLines]}
      markers={[
        ...markers,
        ...qqe.markers,
        ...emaCrossMarkers,
        ...priceActionMarkers,
        ...bollingerMarkers,
        ...trendline.markers,
      ]}
      indicators={[...indicators, ...strategy.indicators]}
      overlayLines={[
        ...strategy.overlayLines,
        ...qqe.overlayLines,
        ...trendline.overlayLines,
      ]}
      zones={zones}
      barColors={barColors}
      focusPoints={focusPoints}
      focusResult={focusResult}
      onVisibleRangeChange={handleVisibleRange}
      onCrosshairOhlc={
        onCrosshairOhlc
          ? (candle) => {
              hoveringRef.current = candle != null
              onCrosshairOhlc(candle ?? candles[candles.length - 1] ?? null)
            }
          : undefined
      }
      onLineDragEnd={onLineDragEnd}
      onLineClick={onLineClick}
      onLineCancel={onLineCancel}
      onChartContextMenu={onChartContextMenu}
      registerApi={registerApi}
      trendlines={visibleTrendlines}
      onTrendlinesChange={handleTrendlinesChange}
      onTrendlinesCommit={handleTrendlinesCommit}
    />
  )
}

/** First index in a time-sorted marker list with `time >= targetMs`. */
function lowerBoundByTime(arr: ChartMarker[], targetMs: number): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].time < targetMs) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** First index in a time-sorted marker list with `time > targetMs`. */
function upperBoundByTime(arr: ChartMarker[], targetMs: number): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].time <= targetMs) lo = mid + 1
    else hi = mid
  }
  return lo
}

function toCandleData(
  candle: ChartCandle,
  colors?: Map<number, ChartBarColor>
): CandlestickData {
  const sec = Math.floor(candle.t / 1000)
  const bar = colors?.get(sec)
  return {
    time: sec as UTCTimestamp,
    open: Number(candle.o),
    high: Number(candle.h),
    low: Number(candle.l),
    close: Number(candle.c),
    ...(bar
      ? {
          color: bar.color,
          borderColor: bar.borderColor ?? bar.color,
          wickColor: bar.wickColor ?? bar.color,
        }
      : {}),
  }
}

function toVolumeData(candle: ChartCandle): HistogramData {
  return {
    time: (candle.t / 1000) as UTCTimestamp,
    value: Number(candle.v),
    color: Number(candle.c) >= Number(candle.o) ? UP_VOLUME : DOWN_VOLUME,
  }
}

/** Duration label for the measure tool: hours within a day, then days. */
function formatDays(days: number): string {
  if (days < 1) return `${(days * 24).toFixed(1)}h`
  const decimals = days < 10 ? 1 : 0
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
