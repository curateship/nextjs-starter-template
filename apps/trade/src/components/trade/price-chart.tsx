import * as React from "react"
import type {
  CandlestickData,
  HistogramData,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts"

import type { CandleBar } from "@/lib/protocols/contracts"

/**
 * The chart, and nothing but the chart.
 *
 * Candles in, candles drawn. It knows no feature: no drawings, no alerts, no
 * orders, no indicators — those arrive later as their own modules against a
 * small surface this component will offer when the first of them is built.
 * Keeping it blind now is what keeps the old app's 3,961-line chart from
 * happening again.
 *
 * The library is loaded in the browser only — the server renders the empty
 * box, and the chart appears with the first paint after it.
 */
export function PriceChart({ candles }: { candles: CandleBar[] }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const chartRef = React.useRef<IChartApi | null>(null)
  const priceSeriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null)
  const volumeSeriesRef = React.useRef<ISeriesApi<"Histogram"> | null>(null)
  // The candles the chart should be showing, readable by the async setup that
  // may still be importing the library when they change.
  const candlesRef = React.useRef(candles)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let themeWatcher: MutationObserver | null = null

    void (async () => {
      const { createChart, CandlestickSeries, HistogramSeries } = await import(
        "lightweight-charts"
      )
      if (disposed || !containerRef.current) return

      const colors = readChartColors(containerRef.current)
      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { color: "transparent" },
          textColor: colors.text,
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: colors.grid },
          horzLines: { color: colors.grid },
        },
        rightPriceScale: { borderColor: colors.grid },
        timeScale: { borderColor: colors.grid, timeVisible: true },
      })

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
      })
      chart
        .priceScale("volume")
        .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

      chartRef.current = chart
      priceSeriesRef.current = price
      volumeSeriesRef.current = volume
      applyCandles(price, volume, candlesRef.current, colors)
      chart.timeScale().fitContent()

      // The shell's theme toggle stamps a class on <html>; recolour in place
      // rather than rebuilding the chart.
      themeWatcher = new MutationObserver(() => {
        if (!containerRef.current) return
        const next = readChartColors(containerRef.current)
        chart.applyOptions({
          layout: { textColor: next.text },
          grid: {
            vertLines: { color: next.grid },
            horzLines: { color: next.grid },
          },
          rightPriceScale: { borderColor: next.grid },
          timeScale: { borderColor: next.grid },
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
      themeWatcher.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"],
      })
    })()

    return () => {
      disposed = true
      themeWatcher?.disconnect()
      chartRef.current?.remove()
      chartRef.current = null
      priceSeriesRef.current = null
      volumeSeriesRef.current = null
    }
    // Built once per mount; data and theme changes are applied to the live
    // chart above and below, never by rebuilding it.
  }, [])

  React.useEffect(() => {
    candlesRef.current = candles
    const price = priceSeriesRef.current
    const volume = volumeSeriesRef.current
    if (!price || !volume || !containerRef.current) return
    applyCandles(price, volume, candles, readChartColors(containerRef.current))
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  return <div ref={containerRef} className="h-full min-h-0 w-full" />
}

function applyCandles(
  price: ISeriesApi<"Candlestick">,
  volume: ISeriesApi<"Histogram">,
  candles: CandleBar[],
  colors: ChartColors
) {
  price.setData(
    candles.map(
      (bar): CandlestickData => ({
        time: (bar.openTime / 1000) as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })
    )
  )
  volume.setData(
    candles.map(
      (bar): HistogramData => ({
        time: (bar.openTime / 1000) as UTCTimestamp,
        value: bar.volume,
        color: bar.close >= bar.open ? colors.upSoft : colors.downSoft,
      })
    )
  )
}

type ChartColors = {
  text: string
  grid: string
  up: string
  down: string
  upSoft: string
  downSoft: string
}

/**
 * The app's own colours, read off the page instead of hard-coded twice.
 *
 * A probe element wearing the same Tailwind classes as the rest of the app is
 * appended, measured and removed: the browser resolves theme variables and
 * the light/dark split to a concrete rgb, which is the one form the chart
 * library is guaranteed to understand. Up and down match the market list's
 * pills, so a rising candle and a rising row are the same green.
 */
function readChartColors(host: HTMLElement): ChartColors {
  const resolve = (className: string) => {
    const probe = document.createElement("span")
    probe.className = className
    host.appendChild(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return toRgb(color)
  }

  const up = resolve("text-emerald-600 dark:text-emerald-400")
  const down = resolve("text-destructive")
  return {
    text: resolve("text-muted-foreground"),
    grid: withAlpha(resolve("text-foreground"), 0.08),
    up,
    down,
    upSoft: withAlpha(up, 0.4),
    downSoft: withAlpha(down, 0.4),
  }
}

/**
 * Any CSS colour to plain `rgba(…)`, via a one-pixel canvas: the theme speaks
 * oklch, the chart library only reads the classics, and the browser is the
 * one thing that reliably translates between them.
 */
function toRgb(color: string): string {
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext("2d")
  if (!ctx) return color
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
}

/** `rgba(…)` with its alpha replaced. */
function withAlpha(rgb: string, alpha: number): string {
  const match = /rgba?\(([^)]+)\)/.exec(rgb)
  if (!match) return rgb
  const [r, g, b] = match[1].split(/[\s,/]+/)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
