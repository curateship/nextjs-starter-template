import * as React from "react"

/**
 * Account-value line chart for a wallet (30-day portfolio history) using
 * lightweight-charts, following the dynamic-import pattern of price-chart.
 */
export function EquityCurve({
  points,
}: {
  points: { time: number; value: number }[]
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container || points.length === 0) return

    let disposed = false
    let cleanup: (() => void) | null = null

    void import("lightweight-charts").then(({ createChart, LineSeries }) => {
      if (disposed || !container) return
      // lightweight-charts cannot parse the theme's oklch() CSS variables —
      // use the same hardcoded palette as price-chart's chartTheme().
      const isDark = document.documentElement.classList.contains("dark")
      const chart = createChart(container, {
        autoSize: true,
        layout: {
          background: { color: "transparent" },
          textColor: isDark ? "#9ca3af" : "#6b7280",
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: "rgba(128,128,128,0.1)" },
        },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, timeVisible: false },
        crosshair: { mode: 0 },
      })
      const series = chart.addSeries(LineSeries, {
        color: "#10b981",
        lineWidth: 2,
        priceLineVisible: false,
      })
      series.setData(
        points.map((point) => ({
          time: Math.floor(point.time / 1000) as never,
          value: point.value,
        }))
      )
      chart.timeScale().fitContent()
      cleanup = () => chart.remove()
    })

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [points])

  if (points.length === 0) return null
  return <div ref={containerRef} className="h-48 w-full" />
}
