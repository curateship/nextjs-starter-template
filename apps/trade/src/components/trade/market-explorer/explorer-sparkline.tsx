import * as React from "react"
import { marketHistory } from "@/lib/trade/live-market"
import { moneyTone } from "@/lib/trade/money-tone"

export function ExplorerSparkline({ marketKey }: { marketKey: string }) {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  React.useEffect(() => {
    const element = canvas.current
    if (!element) return
    const context = element.getContext("2d")
    if (!context) return
    const reduced = matchMedia("(prefers-reduced-motion: reduce)")
    let last = 0
    const draw = () => {
      if (document.hidden || (reduced.matches && Date.now() - last < 60_000))
        return
      last = Date.now()
      const points = marketHistory.prices(marketKey, last)
      context.clearRect(0, 0, 120, 32)
      if (!points.length) return
      const first = points[0],
        end = points.at(-1)!
      element.className = `h-8 w-28 ${moneyTone(end.price - first.price) ?? "text-foreground"}`
      context.strokeStyle = getComputedStyle(element).color
      const low = Math.min(...points.map((point) => point.price))
      const high = Math.max(...points.map((point) => point.price))
      context.lineWidth = 1.5
      context.beginPath()
      points.forEach((point, index) => {
        const x =
          2 +
          ((point.time - first.time) / Math.max(1, end.time - first.time)) * 116
        const y =
          high === low ? 16 : 30 - ((point.price - low) / (high - low)) * 28
        if (index) context.lineTo(x, y)
        else context.moveTo(x, y)
      })
      context.stroke()
    }
    draw()
    const timer = setInterval(draw, 1000)
    return () => clearInterval(timer)
  }, [marketKey])
  return (
    <canvas
      ref={canvas}
      width={120}
      height={32}
      className="h-8 w-28"
      role="img"
      aria-label="Price over the last five minutes, blank until 30 samples arrive"
    />
  )
}
