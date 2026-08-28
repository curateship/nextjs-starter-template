import * as React from "react"
import type {
  CandlestickData,
  HistogramData,
  IChartApi,
  ISeriesApi,
  Logical,
  TickMarkType,
  Time,
  UTCTimestamp,
} from "lightweight-charts"

import type { CandleBar } from "@/lib/protocols/contracts"
import type { ChartOptions } from "@/lib/trade/chart-options"
import { zoneAxisLabel, zoneCrosshairLabel } from "@/lib/trade/chart-timezone"
import { barOfTime, timeOfBar } from "@/lib/trade/chart-time"
import { readChartColors, type ChartColors } from "@/lib/trade/chart-theme"
import {
  DEFAULT_MARGIN_BOTTOM,
  DEFAULT_MARGIN_TOP,
  frameOf,
  sameView,
  viewOf,
  type ChartView,
} from "@/lib/trade/chart-view"

/**
 * The chart, and nothing but the chart.
 *
 * Candles in, candles drawn. It knows no feature: no drawings, no alerts, no
 * orders, no indicators. What it does offer is one small surface — where a
 * time and a price land on screen, and a slot to draw in — and that surface
 * says nothing about what is being drawn. Paint tools consume it today; an
 * alert on a line will consume it later without this file hearing the word
 * "alert". Keeping it blind is what keeps the old app's 3,961-line chart from
 * happening again.
 *
 * The library is loaded in the browser only — the server renders the empty
 * box, and the chart appears with the first paint after it.
 */

/**
 * What the chart offers anything drawing on top of it.
 *
 * Coordinates both ways and the size of the plot area, and that is the whole
 * contract. The consumer decides what a shape is, how it is picked up, and
 * where it is kept; the chart only answers "where does this land right now?".
 *
 * Every answer is in CSS pixels from the top-left of the plot area — the
 * candles, not the axes around them.
 */
export type ChartSurface = {
  width: number
  height: number
  /**
   * How wide the price axis to the right of the plot is.
   *
   * Everything else here measures the plot alone, and drawing stops at its
   * edge. This one number is what lets a layer put a price on the axis beside
   * the line it belongs to — the axis is still not somewhere the chart draws,
   * it is only somewhere it can now say how far away.
   */
  axisWidth: number
  /** Epoch milliseconds to a horizontal position, off the ends included. */
  xOf(time: number): number
  /** The centre of the candle that contains this epoch millisecond. */
  xOfContainingBar(time: number): number
  /** A horizontal position back to epoch milliseconds. */
  timeAt(x: number): number
  /**
   * Epoch milliseconds as a position in candles — 0 is the oldest, 1 the next.
   *
   * For anything counting bars rather than measuring pixels. It is the same
   * number `xOf` works from, so "how many candles apart are these two times?"
   * is one subtraction and never a guess at how long a candle is. Fractional
   * between candles, and past either end it carries on at the spacing of the
   * nearest pair.
   */
  barAt(time: number): number
  /** A price to a vertical position, or null before the scale exists. */
  yOf(price: number): number | null
  /** A vertical position back to a price. */
  priceAt(y: number): number | null
}

/**
 * The numbers the surface's answers depend on. Compared field by field on
 * every repaint so a mouse moving over an unchanged chart — which the library
 * reports constantly — does not redraw the layer above it.
 */
type Viewport = {
  width: number
  height: number
  axisWidth: number
  /** Where bar 0 sits and how wide a bar is: the whole sideways mapping. */
  barZeroX: number
  barWidth: number
  /** The prices at the top and bottom edge: the whole up-and-down mapping. */
  topPrice: number
  bottomPrice: number
}

function sameViewport(a: Viewport | null, b: Viewport | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.axisWidth === b.axisWidth &&
    a.barZeroX === b.barZeroX &&
    a.barWidth === b.barWidth &&
    a.topPrice === b.topPrice &&
    a.bottomPrice === b.bottomPrice
  )
}

/**
 * The highest and lowest price among the candles between two bar positions.
 * Null when that stretch holds no candles at all — a chart scrolled out into
 * the empty space past the newest one.
 *
 * `live` is the working bar the feed is still filling in, at the position it
 * occupies. It has to be counted: the chart scales itself to what it is
 * actually drawing, so leaving it out would make every reading of the squash
 * slightly wrong, and slightly wrong readings saved and re-applied all day
 * would walk the chart somewhere nobody put it.
 */
function highLowBetween(
  candles: CandleBar[],
  live: { bar: CandleBar; index: number } | null,
  from: number,
  to: number
): { high: number; low: number } | null {
  const first = Math.max(0, Math.ceil(from))
  const last = Math.min(candles.length - 1, Math.floor(to))
  let high: number | null = null
  let low: number | null = null
  for (let index = first; index <= last; index += 1) {
    if (high === null || candles[index].high > high) high = candles[index].high
    if (low === null || candles[index].low < low) low = candles[index].low
  }
  if (live && live.index >= from && live.index <= to) {
    if (high === null || live.bar.high > high) high = live.bar.high
    if (low === null || live.bar.low < low) low = live.bar.low
  }
  return high === null || low === null ? null : { high, low }
}

function readViewport(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  /** The whole chart including its axes, for working out how wide they are. */
  totalWidth: number
): Viewport | null {
  const pane = chart.paneSize()
  if (pane.width <= 0 || pane.height <= 0) return null

  const scale = chart.timeScale()
  const barZeroX = scale.logicalToCoordinate(0 as Logical)
  const barOneX = scale.logicalToCoordinate(1 as Logical)
  const topPrice = series.coordinateToPrice(0)
  const bottomPrice = series.coordinateToPrice(pane.height)
  if (
    barZeroX === null ||
    barOneX === null ||
    topPrice === null ||
    bottomPrice === null ||
    barOneX === barZeroX
  ) {
    return null
  }

  return {
    width: pane.width,
    height: pane.height,
    axisWidth: Math.max(0, totalWidth - pane.width),
    barZeroX,
    barWidth: barOneX - barZeroX,
    topPrice,
    bottomPrice,
  }
}

export function PriceChart({
  candles,
  options,
  viewKey,
  readView,
  onViewChange,
  liveBars,
  overlay,
}: {
  candles: CandleBar[]
  /** Supporting chart parts that may be shown or hidden. */
  options: ChartOptions
  /**
   * What these candles are: a market and a timeframe, as one string. The
   * whole history is framed once per value of it.
   *
   * This is what tells a genuinely different chart apart from more data for
   * the chart already on screen. Candles arriving is not the same question —
   * the live feed refetches after every gap it recovers from, and refitting on
   * that would throw away a zoom somebody set on purpose, every few minutes.
   */
  viewKey: string
  /**
   * How far to zoom in and how far back to scroll, from wherever the app keeps
   * that. Applied in place of framing the whole history, so a view somebody
   * set carries onto the next market; answering null frames the history, as
   * before.
   *
   * Asked for rather than handed over, and asked for only at the moment a
   * chart is framed. The answer changes on every frame of a pan, and passing
   * it in would re-render this component a hundred times a gesture to tell it
   * what it is already showing.
   */
  readView?: () => ChartView | null
  /**
   * Called when the view is moved by hand, at most once per movement. Not
   * called for the frame this component sets itself, and not for the shuffle
   * along that a new candle causes.
   */
  onViewChange?: (view: ChartView) => void
  /**
   * Where the working bar comes from: called once with a callback, it
   * delivers every tick to it and returns a way to stop. The chart applies
   * each tick to its last candle in place. Nothing about a tick goes through
   * React, so a tick re-renders neither this chart nor the panel above it —
   * which used to happen on every one, taking every overlay layer with it.
   * Keep the function stable across renders; a new one resubscribes.
   */
  liveBars?: (onBar: (bar: CandleBar) => void) => () => void
  /**
   * Drawn over the candles, handed the surface. Called again every time the
   * view moves, so it can render straight from the coordinates it is given.
   */
  overlay?: (surface: ChartSurface, colors: ChartColors) => React.ReactNode
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const chartRef = React.useRef<IChartApi | null>(null)
  const priceSeriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeSeriesRef = React.useRef<ISeriesApi<"Histogram"> | null>(null)
  // The candles the chart should be showing, readable by the async setup that
  // may still be importing the library when they change.
  const candlesRef = React.useRef(candles)
  const colorsRef = React.useRef<ChartColors | null>(null)
  const [colors, setColors] = React.useState<ChartColors | null>(null)
  // Every open-time on screen, in order — the candles plus any live bar that
  // has appended itself since. The sideways mapping is measured off this, so
  // it has to include the bar the live feed added or a drawing out to the
  // right of the last candle shifts when a new one forms.
  const timesRef = React.useRef<number[]>([])
  // The working bar the feed is filling in, and which position it sits at —
  // the chart scales itself to it, so anything measuring the chart has to.
  const liveBarRef = React.useRef<{ bar: CandleBar; index: number } | null>(
    null
  )
  // The newest time on the chart: the library refuses updates that go
  // backwards, and a straggler tick from the previous market must be dropped,
  // not drawn.
  const lastTimeRef = React.useRef(0)
  // The series the view was last framed for. See `viewKey`.
  const fittedViewRef = React.useRef<string | null>(null)
  // The two ways in and out of the remembered view, readable from the
  // library's callbacks — which outlive any one render — plus the last view
  // reported back, so the same one is never reported twice.
  const readViewRef = React.useRef(readView)
  const onViewChangeRef = React.useRef(onViewChange)
  const reportedViewRef = React.useRef<ChartView | null>(null)
  const currentViewRef = React.useRef<() => ChartView | null>(() => null)
  // While the chart is being framed by this component, the range changes it
  // reports are this component's own doing and are not somebody's view to
  // remember. Cleared a beat later, because the library reports them after
  // the call rather than during it.
  const framingRef = React.useRef(false)
  const optionsRef = React.useRef(options)
  const crosshairModesRef = React.useRef<{
    normal: number
    hidden: number
  } | null>(null)

  React.useEffect(() => {
    optionsRef.current = options
    const chart = chartRef.current
    if (!chart) return
    chart.applyOptions({
      grid: {
        vertLines: { visible: options.grid },
        horzLines: { visible: options.grid },
      },
    })
    const modes = crosshairModesRef.current
    if (modes) {
      chart.applyOptions({
        crosshair: { mode: options.crosshair ? modes.normal : modes.hidden },
      })
    }
    volumeSeriesRef.current?.applyOptions({ visible: options.volume })
    // The clock. Applied in place like everything else here — a chart rebuilt
    // to change a label would throw away the zoom somebody set.
    chart.applyOptions(clockOptions(options.zone))
  }, [options])

  React.useEffect(() => {
    readViewRef.current = readView
    onViewChangeRef.current = onViewChange
  }, [onViewChange, readView])

  /**
   * Put the chart where it should start: the remembered view if there is one,
   * otherwise its whole history.
   *
   * Both directions. The sideways half is a range of bar positions; the
   * up-and-down half is the share of the height left above and below the
   * candles, which the library keeps applying for itself as the price moves —
   * so the squash survives the next tick as well as the next market.
   */
  const frameChart = React.useCallback(() => {
    const chart = chartRef.current
    const series = priceSeriesRef.current
    if (!chart || !series) return
    const remembered = readViewRef.current?.() ?? null
    const frame = remembered
      ? frameOf(remembered, timesRef.current.length)
      : null
    framingRef.current = true
    if (remembered && frame) {
      series.priceScale().applyOptions({
        autoScale: true,
        scaleMargins: {
          top: remembered.marginTop,
          bottom: remembered.marginBottom,
        },
      })
      chart.timeScale().setVisibleLogicalRange({
        from: frame.from as Logical,
        to: frame.to as Logical,
      })
      reportedViewRef.current = remembered
    } else {
      chart.timeScale().fitContent()
      reportedViewRef.current = null
    }
    // A short window rather than one frame: the price scale settles over a
    // repaint or two, and nobody's gesture starts and finishes inside it.
    setTimeout(() => {
      // The library rounds the requested range and margins to its own pixels.
      // That settled frame is still our opening move, not the person's, so it
      // becomes the comparison point before reporting is switched back on.
      const settled = currentViewRef.current()
      if (settled) reportedViewRef.current = settled
      framingRef.current = false
    }, 200)
  }, [])

  /**
   * Back to the whole history, both directions: every candle across the width
   * and the library's own share of the height above and below them.
   *
   * Deliberately not routed through `frameChart` — that one *applies* a
   * remembered view and hushes the reporting while it does it. This one throws
   * the remembered view away, so the reporting has to run: whatever the chart
   * settles at is what gets written down, and reopening the page shows the
   * reset rather than the zoom it replaced.
   */
  const resetChart = React.useCallback(() => {
    const chart = chartRef.current
    const series = priceSeriesRef.current
    if (!chart || !series) return
    series.priceScale().applyOptions({
      autoScale: true,
      scaleMargins: { top: DEFAULT_MARGIN_TOP, bottom: DEFAULT_MARGIN_BOTTOM },
    })
    chart.timeScale().fitContent()
  }, [])

  /**
   * What the chart is set up like right now, if it can be read.
   *
   * The up-and-down half needs both the window of prices on screen and the
   * highest and lowest candle in it, because what is being measured is how
   * much of the height the candles are given.
   */
  const currentView = React.useCallback((): ChartView | null => {
    const chart = chartRef.current
    const series = priceSeriesRef.current
    if (!chart || !series) return null
    const range = chart.timeScale().getVisibleLogicalRange()
    const pane = chart.paneSize()
    if (!range || pane.height <= 0) return null
    const top = series.coordinateToPrice(0)
    const bottom = series.coordinateToPrice(pane.height)
    if (top === null || bottom === null) return null

    const extent = highLowBetween(
      candlesRef.current,
      liveBarRef.current,
      range.from,
      range.to
    )
    if (!extent) return null
    return viewOf({
      range: { from: range.from, to: range.to },
      barCount: timesRef.current.length,
      top,
      bottom,
      high: extent.high,
      low: extent.low,
    })
  }, [])
  React.useEffect(() => {
    currentViewRef.current = currentView
  }, [currentView])

  /** Tell the app the view moved, unless it was this component that moved it. */
  const reportView = React.useCallback(() => {
    if (framingRef.current) return
    const next = currentView()
    if (!next || sameView(next, reportedViewRef.current)) return
    reportedViewRef.current = next
    onViewChangeRef.current?.(next)
  }, [currentView])

  // The surface handed to the overlay, rebuilt only when one of the numbers
  // its answers depend on has actually moved.
  const [surface, setSurface] = React.useState<ChartSurface | null>(null)
  const viewportRef = React.useRef<Viewport | null>(null)

  // Recomputed on the chart's own repaint rather than on a timer: the library
  // calls the attached primitive below whenever anything about the view has
  // changed, which is exactly when the answers move.
  const refreshSurface = React.useCallback(() => {
    const chart = chartRef.current
    const series = priceSeriesRef.current
    const next =
      chart && series
        ? readViewport(chart, series, containerRef.current?.clientWidth ?? 0)
        : null
    if (sameViewport(viewportRef.current, next)) return
    viewportRef.current = next
    // The one honest moment to notice the view moved, and it covers both
    // directions: dragging the price axis never touches the sideways range,
    // so watching that alone would miss the squash entirely.
    reportView()
    if (!next || !series) {
      setSurface(null)
      return
    }
    setSurface({
      width: next.width,
      height: next.height,
      axisWidth: next.axisWidth,
      // The bar list is read as the answer is asked for, not captured here:
      // a live bar appending itself changes what lies to the right of the
      // last candle without moving anything already on screen.
      xOf: (time) =>
        next.barZeroX + barOfTime(timesRef.current, time) * next.barWidth,
      xOfContainingBar: (time) =>
        next.barZeroX +
        Math.floor(barOfTime(timesRef.current, time)) * next.barWidth,
      timeAt: (x) =>
        timeOfBar(timesRef.current, (x - next.barZeroX) / next.barWidth),
      barAt: (time) => barOfTime(timesRef.current, time),
      yOf: (price) => series.priceToCoordinate(price),
      priceAt: (y) => series.coordinateToPrice(y),
    })
  }, [reportView])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let themeWatcher: MutationObserver | null = null
    let pending = 0

    void (async () => {
      const { createChart, CandlestickSeries, HistogramSeries, CrosshairMode } =
        await import("lightweight-charts")
      if (disposed || !containerRef.current) return
      crosshairModesRef.current = {
        normal: CrosshairMode.Normal,
        hidden: CrosshairMode.Hidden,
      }

      const colors = readChartColors(containerRef.current)
      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { color: "transparent" },
          textColor: colors.text,
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: colors.grid, visible: optionsRef.current.grid },
          horzLines: { color: colors.grid, visible: optionsRef.current.grid },
        },
        // The library's default is "magnet": the horizontal line snaps to
        // each candle's price, leaping close-to-close as the mouse crosses
        // bars — which reads as the crosshair skipping all over the place.
        // Normal simply follows the mouse.
        crosshair: {
          mode: optionsRef.current.crosshair
            ? CrosshairMode.Normal
            : CrosshairMode.Hidden,
        },
        rightPriceScale: { borderColor: colors.border },
        timeScale: { borderColor: colors.border, timeVisible: true },
      })
      // The clock the times on it are read against. Applied here as well as in
      // the effect above because that effect runs before the library has
      // finished loading, and so cannot have reached this chart.
      chart.applyOptions(clockOptions(optionsRef.current.zone))

      const price = chart.addSeries(CandlestickSeries, {
        upColor: colors.up,
        downColor: colors.down,
        borderUpColor: colors.up,
        borderDownColor: colors.down,
        wickUpColor: colors.up,
        wickDownColor: colors.down,
      })
      // Volume lives in the bottom fifth of the same pane, on its own scale,
      // so a huge bar never squashes the candles.
      const volume = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
        visible: optionsRef.current.volume,
      })
      chart
        .priceScale("volume")
        .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

      chartRef.current = chart
      priceSeriesRef.current = price
      volumeSeriesRef.current = volume
      colorsRef.current = colors
      setColors(colors)
      applyCandles(price, volume, candlesRef.current, colors)
      timesRef.current = candlesRef.current.map((bar) => bar.openTime)
      lastTimeRef.current = candlesRef.current.at(-1)?.openTime ?? 0
      frameChart()

      // A primitive that draws nothing. Its one job is being told when the
      // chart has repainted, which is the only honest moment to re-read where
      // a time and a price now land — panning, zooming, resizing and the price
      // scale rescaling itself all arrive here and nowhere else. Coalesced
      // onto one frame because the library also calls it on every mouse move.
      price.attachPrimitive({
        updateAllViews: () => {
          if (pending) return
          pending = requestAnimationFrame(() => {
            pending = 0
            refreshSurface()
          })
        },
      })
      refreshSurface()

      // The theme class lives on <html>, while Styling puts its Divider lines
      // token on a shell wrapper. Watch the chart's ancestor chain so either
      // change recolours the live chart and its overlays in place.
      themeWatcher = new MutationObserver(() => {
        if (!containerRef.current) return
        const next = readChartColors(containerRef.current)
        colorsRef.current = next
        setColors(next)
        chart.applyOptions({
          layout: { textColor: next.text },
          grid: {
            vertLines: {
              color: next.grid,
              visible: optionsRef.current.grid,
            },
            horzLines: {
              color: next.grid,
              visible: optionsRef.current.grid,
            },
          },
          rightPriceScale: { borderColor: next.border },
          timeScale: { borderColor: next.border },
        })
        price.applyOptions({
          upColor: next.up,
          downColor: next.down,
          borderUpColor: next.up,
          borderDownColor: next.down,
          wickUpColor: next.up,
          wickDownColor: next.down,
        })
        applyCandles(price, volume, candlesRef.current, next)
      })
      for (
        let ancestor: HTMLElement | null = containerRef.current;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        themeWatcher.observe(ancestor, {
          attributes: true,
          attributeFilter: ["class", "data-theme", "style"],
        })
      }
    })()

    return () => {
      disposed = true
      if (pending) cancelAnimationFrame(pending)
      themeWatcher?.disconnect()
      chartRef.current?.remove()
      chartRef.current = null
      priceSeriesRef.current = null
      volumeSeriesRef.current = null
    }
    // Built once per mount; data and theme changes are applied to the live
    // chart above and below, never by rebuilding it.
  }, [frameChart, refreshSurface])

  React.useEffect(() => {
    candlesRef.current = candles
    // Asked before anything else, because the chart may not exist yet on the
    // first run and the answer still has to be recorded: the very first series
    // is framed by the setup above as the chart is built, and every value of
    // `viewKey` after that is framed here.
    const newSeries = fittedViewRef.current !== viewKey
    fittedViewRef.current = viewKey

    const price = priceSeriesRef.current
    const volume = volumeSeriesRef.current
    if (!price || !volume || !containerRef.current) return
    const colors = readChartColors(containerRef.current)
    colorsRef.current = colors
    applyCandles(price, volume, candles, colors)
    timesRef.current = candles.map((bar) => bar.openTime)
    lastTimeRef.current = candles.at(-1)?.openTime ?? 0
    // These candles replace whatever the feed had added on top of the last
    // set, so the working bar starts over with them.
    liveBarRef.current = null
    // More candles for the chart already on screen leave the view exactly
    // where it was — zoom, scroll and all.
    if (newSeries) frameChart()
    refreshSurface()
  }, [candles, viewKey, frameChart, refreshSurface])

  // The live tick: the working bar changes in place, a fresh bar appends.
  // Subscribed here, applied straight to the series — see `liveBars`.
  React.useEffect(() => {
    if (!liveBars) return
    return liveBars((liveBar) => {
      const price = priceSeriesRef.current
      const volume = volumeSeriesRef.current
      const colors = colorsRef.current
      if (!price || !volume || !colors) return
      if (liveBar.openTime < lastTimeRef.current) return
      if (liveBar.openTime > lastTimeRef.current) {
        timesRef.current = [...timesRef.current, liveBar.openTime]
      }
      lastTimeRef.current = liveBar.openTime
      liveBarRef.current = { bar: liveBar, index: timesRef.current.length - 1 }
      const time = (liveBar.openTime / 1000) as UTCTimestamp
      price.update({
        time,
        open: liveBar.open,
        high: liveBar.high,
        low: liveBar.low,
        close: liveBar.close,
      })
      volume.update({
        time,
        value: liveBar.volume,
        color: liveBar.close >= liveBar.open ? colors.upSoft : colors.downSoft,
      })
    })
  }, [liveBars])

  return (
    <div className="relative h-full min-h-0 w-full">
      {/* Double-click puts the chart back to its whole history. On this box
          rather than the one around it, because everything drawn on top —
          lines, orders, ladders — is a sibling of it: a double-click meant for
          a drawn line, or a second click of a tool, never reaches here. */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        onDoubleClick={resetChart}
      />
      {overlay && surface && colors ? (
        // As tall as the plot and as wide as the plot plus the price axis. The
        // extra strip is there for one thing only — a price badge sitting on
        // the axis beside the line it belongs to, the way every trading chart
        // shows one. Everything the surface measures still stops at the plot,
        // so nothing drifts over the time axis below.
        //
        // The z-index is load-bearing: the library stacks its own canvases at
        // 1 and 2, so without it this sits underneath them — visible, because
        // they are transparent, but never touched, because every click lands
        // on the canvas instead.
        <div
          className="pointer-events-none absolute top-0 left-0 z-10 overflow-hidden"
          style={{
            width: surface.width + surface.axisWidth,
            height: surface.height,
          }}
        >
          {overlay(surface, colors)}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The label shapes the library asks for, in its own order.
 *
 * It thins labels out as the chart zooms and says which shape it wants by the
 * number beside them. Its fifth — a time with seconds — has no entry here
 * because no timeframe this app charts is finer than a minute, and it falls
 * back to the plain time.
 */
const TICK_SHAPES = ["year", "month", "day", "time"] as const

function shapeOf(mark: TickMarkType): (typeof TICK_SHAPES)[number] {
  return TICK_SHAPES.at(mark) ?? "time"
}

/**
 * Every time this chart is handed back is one it set itself, and it only ever
 * sets seconds — see `applyCandles`. The library's own type allows a calendar
 * date as well, which nothing here ever produces.
 */
function msOf(time: Time): number {
  return (time as UTCTimestamp) * 1000
}

/**
 * How the axis and the crosshair say a time, on the chart's own clock.
 *
 * Rebuilt whenever the zone changes and applied to the live chart, never by
 * rebuilding the chart.
 */
function clockOptions(zone: string) {
  return {
    localization: {
      timeFormatter: (time: Time) => zoneCrosshairLabel(zone, msOf(time)),
    },
    timeScale: {
      tickMarkFormatter: (time: Time, shape: TickMarkType) =>
        zoneAxisLabel(zone, msOf(time), shapeOf(shape)),
    },
  }
}

function applyCandles(
  price: ISeriesApi<"Candlestick">,
  volume: ISeriesApi<"Histogram">,
  candles: CandleBar[],
  colors: ChartColors
) {
  price.setData(
    candles.map((bar): CandlestickData => ({
      time: (bar.openTime / 1000) as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }))
  )
  volume.setData(
    candles.map((bar): HistogramData => ({
      time: (bar.openTime / 1000) as UTCTimestamp,
      value: bar.volume,
      color: bar.close >= bar.open ? colors.upSoft : colors.downSoft,
    }))
  )
}
