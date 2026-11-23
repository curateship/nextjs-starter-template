import type * as React from "react"

import {
  CHART_DOWN_COLOR,
  CHART_UP_COLOR,
} from "@/components/chart/chart-markers"
import { signedPct } from "@/lib/format"
import {
  chartPositionStats,
  type ChartPosition,
  type ChartPositionBox,
} from "@/lib/trading/chart-positions"

/** Fill strength that keeps the candles readable through the zones. */
const REWARD_FILL = "rgba(8, 153, 129, 0.16)"
const RISK_FILL = "rgba(242, 54, 69, 0.16)"
/** Selection blue, shared with the trendline tool's default colour. */
const HANDLE_COLOR = "#2962ff"

export type ChartPositionPixels = ChartPositionBox & {
  id: string
  side: ChartPosition["side"]
}


/** A price chip pinned to one of the drawing's three lines. */
function PriceChip({
  x,
  y,
  color,
  place,
  children,
}: {
  x: number
  y: number
  color: string
  /** Which side of the line the chip sits on, so it never covers the zone. */
  place: "above" | "below"
  children: React.ReactNode
}) {
  return (
    <div
      className="absolute rounded px-1 py-px text-[10px] leading-tight whitespace-nowrap text-white shadow-sm"
      style={{
        left: x,
        top: y,
        transform: `translate(-50%, ${place === "above" ? "-115%" : "15%"})`,
        backgroundColor: color,
      }}
    >
      {children}
    </div>
  )
}

/**
 * The long/short position drawing: a planned trade shown as a green reward zone
 * and a red risk zone either side of the entry line. Purely visual — pointer
 * handling lives on the chart itself, so this layer never takes the mouse.
 */
export function ChartPositionOverlay({
  positions,
  pixels,
  selectedId,
}: {
  positions: ChartPosition[]
  pixels: ChartPositionPixels[]
  selectedId: string | null
}) {
  const byId = new Map(positions.map((position) => [position.id, position]))
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {pixels.map((box) => {
        const position = byId.get(box.id)
        if (!position) return null
        const stats = chartPositionStats(position)
        const selected = box.id === selectedId
        const left = Math.min(box.left, box.right)
        const width = Math.abs(box.right - box.left)
        const centerX = left + width / 2
        const zone = (from: number, to: number, fill: string) => ({
          left,
          width,
          top: Math.min(from, to),
          height: Math.abs(to - from),
          backgroundColor: fill,
        })
        const targetAbove = box.targetY < box.entryY
        return (
          <div key={box.id} data-position-id={box.id}>
            <div
              className="absolute"
              style={zone(box.entryY, box.targetY, REWARD_FILL)}
            />
            <div
              className="absolute"
              style={zone(box.entryY, box.stopY, RISK_FILL)}
            />
            {(
              [
                { y: box.targetY, color: CHART_UP_COLOR },
                { y: box.stopY, color: CHART_DOWN_COLOR },
                { y: box.entryY, color: "var(--foreground)" },
              ] as const
            ).map((line) => (
              <div
                key={line.y}
                className="absolute"
                style={{
                  left,
                  width,
                  top: line.y,
                  height: 1,
                  backgroundColor: line.color,
                  opacity: line.color === "var(--foreground)" ? 0.7 : 1,
                }}
              />
            ))}
            {/* The readouts belong to the drawing you are working on. Click
                away and only the zones stay, so a chart full of plans is not a
                chart full of labels. */}
            {selected ? (
              <>
                <PriceChip
                  x={centerX}
                  y={box.targetY}
                  color={CHART_UP_COLOR}
                  place={targetAbove ? "above" : "below"}
                >
                  {signedPct(stats.targetPct)}
                </PriceChip>
                <PriceChip
                  x={centerX}
                  y={box.stopY}
                  color={CHART_DOWN_COLOR}
                  place={targetAbove ? "below" : "above"}
                >
                  {signedPct(stats.stopPct)}
                </PriceChip>
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-card/95 px-1 py-px text-center text-[10px] leading-tight whitespace-nowrap ring-1 ring-foreground/10"
                  style={{ left: centerX, top: box.entryY }}
                >
                  Risk/reward{" "}
                  {stats.ratio === null ? "—" : stats.ratio.toFixed(2)}
                </div>
              </>
            ) : null}
            {selected
              ? (
                  [
                    { x: box.left, y: box.targetY },
                    { x: box.left, y: box.entryY },
                    { x: box.left, y: box.stopY },
                    { x: box.right, y: box.entryY },
                  ] as const
                ).map((handle, index) => (
                  <div
                    key={index}
                    className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card"
                    style={{
                      left: handle.x,
                      top: handle.y,
                      borderColor: HANDLE_COLOR,
                    }}
                  />
                ))
              : null}
          </div>
        )
      })}
    </div>
  )
}
