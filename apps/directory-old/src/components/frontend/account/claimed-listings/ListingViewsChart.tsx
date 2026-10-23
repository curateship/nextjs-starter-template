"use client"

import { useState } from "react"

import { buildSmoothLinePath } from "@/lib/charts/spark-path"
import type { ListingViewsPoint } from "@/lib/actions/analytics/listing-analytics-actions"

// Owner-facing daily views chart. Same visual language as the dashboard sparkline
// (foreground line, muted-foreground area, Catmull-Rom curve) but responsive with a
// hover tooltip. The viewBox is stretched to fill (preserveAspectRatio="none"); a
// non-scaling stroke keeps the line an even thickness at any width, and the dot,
// guide, and tooltip are drawn in an HTML overlay so they never distort.

const VIEW_W = 600
const VIEW_H = 160
const PAD_Y = 10

interface ListingViewsChartProps {
  series: ListingViewsPoint[]
}

export function ListingViewsChart({ series }: ListingViewsChartProps) {
  const [hover, setHover] = useState<number | null>(null)

  const count = series.length
  if (count === 0) return null

  const maxViews = Math.max(1, ...series.map((point) => point.views))
  const xOf = (index: number) => (count <= 1 ? VIEW_W / 2 : (index / (count - 1)) * VIEW_W)
  const yOf = (views: number) => VIEW_H - PAD_Y - (views / maxViews) * (VIEW_H - PAD_Y * 2)

  const points = series.map((point, index) => ({ x: xOf(index), y: yOf(point.views) }))
  const line = buildSmoothLinePath(points)
  const area = line
    ? `${line} L${points[count - 1].x},${VIEW_H} L${points[0].x},${VIEW_H} Z`
    : ""

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const ratio = (event.clientX - rect.left) / rect.width
    const index = Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))))
    setHover(index)
  }

  const active = hover != null ? series[hover] : null
  const activeLeft = hover != null ? (xOf(hover) / VIEW_W) * 100 : 0
  const activeTop = active ? (yOf(active.views) / VIEW_H) * 100 : 0

  return (
    <div
      className="relative h-40 w-full"
      onPointerMove={handleMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        className="block"
        aria-hidden="true"
      >
        {area ? <path d={area} fill="var(--muted-foreground)" fillOpacity={0.13} /> : null}
        <path
          d={line}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {active ? (
        <>
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px -translate-x-1/2 bg-foreground/20"
            style={{ left: `${activeLeft}%` }}
          />
          <div
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-foreground"
            style={{ left: `${activeLeft}%`, top: `${activeTop}%` }}
          />
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-center shadow-sm"
            style={{
              left: `${Math.min(88, Math.max(12, activeLeft))}%`,
              top: `${Math.max(activeTop - 4, 6)}%`,
            }}
          >
            <div className="text-xs font-medium text-popover-foreground">{active.label}</div>
            <div className="text-xs text-muted-foreground">
              {active.views.toLocaleString()} {active.views === 1 ? "view" : "views"}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
