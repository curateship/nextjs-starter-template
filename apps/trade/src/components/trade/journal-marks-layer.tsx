import * as React from "react"

import type { ChartSurface } from "@/components/trade/price-chart"
import {
  openFillMarks,
  tradeFillMarks,
  type LiveFill,
  type LiveFillMark,
  type LiveTrade,
} from "@/lib/trade/live-trades"
import { cn } from "@/lib/utils"

/**
 * Finished fills for the market on screen, drawn over the candles they
 * happened on.
 *
 * **An arrow per fill**, at the exact price and moment, joined by a dotted
 * line from the way in to the way out. A trade that was added to twice really
 * did three things at three prices, and one blended entry would hide that —
 * the same reason the backtest chart draws every fill rather than a summary.
 *
 * Every fill keeps its arrow on the chart without needing a Journal row to be
 * picked first. Picking a trade adds its dotted in-to-out line and, when a
 * stop ended it, the dashed stop line across its span. That is the whole
 * question somebody opens the Journal row for: was the stop sitting too
 * close, or did the market simply keep going?
 *
 * The same idiom as every other layer here: handed a surface that says where a
 * time and a price land, it draws on top, and `price-chart.tsx` is never
 * edited. Only the arrows take the pointer, so the chart still pans, zooms and
 * shows its crosshair everywhere between them.
 */

/** How far off the price the arrow's tip sits, and how big the arrow is. */
const GAP = 2
const TICK_HALF = 9
const HEAD = 9
const HEAD_HALF = 7
const STEM = 7
const STEM_HALF = 2.5

/** How far outside the plot an arrow may reach before it is left out entirely. */
const OFF_SCREEN = 40

const LABEL_HALF_WIDTH = 110
const LABEL_HEIGHT = 52

/** A wide head on a short stem — the shape a trading chart marks a fill with. */
function arrow(x: number, y: number, side: "buy" | "sell"): string {
  const d = side === "buy" ? 1 : -1
  const tip = y + GAP * d
  const neck = tip + HEAD * d
  const tail = neck + STEM * d
  return [
    `${x},${tip}`,
    `${x - HEAD_HALF},${neck}`,
    `${x - STEM_HALF},${neck}`,
    `${x - STEM_HALF},${tail}`,
    `${x + STEM_HALF},${tail}`,
    `${x + STEM_HALF},${neck}`,
    `${x + HEAD_HALF},${neck}`,
  ].join(" ")
}

type Hovered = { mark: LiveFillMark; x: number; y: number }

type ChartFillMark = {
  id: string
  tradeId: string
  mark: LiveFillMark
}

export function JournalMarksLayer({
  surface,
  trades,
  fills,
  focusedTrade,
  showArrows,
}: {
  surface: ChartSurface
  /** Every finished trade for the market currently on screen. */
  trades: readonly LiveTrade[]
  /** Every fill, including entries for positions that are still open. */
  fills: readonly LiveFill[]
  /** The trade picked in the Journal, or null when none is. */
  focusedTrade: LiveTrade | null
  /** Whether fill arrows are enabled in the chart's View options. */
  showArrows: boolean
}) {
  const [hovered, setHovered] = React.useState<Hovered | null>(null)
  const marks = React.useMemo<ChartFillMark[]>(() => {
    const finished = trades.flatMap((trade) =>
      tradeFillMarks(trade).map((mark, index) => ({
        id: `${trade.id}:${mark.at}:${mark.side}:${index}`,
        tradeId: trade.id,
        mark,
      }))
    )
    const open = openFillMarks(fills).map((mark, index) => ({
      id: `open:${mark.at}:${mark.side}:${index}`,
      tradeId: "open",
      mark,
    }))
    return [...finished, ...open]
  }, [fills, trades])

  // Panning away from the arrow under the pointer must take its label with it,
  // rather than leaving one floating over a price it has nothing to do with.
  const onPlot =
    showArrows && hovered && hovered.x >= 0 && hovered.x <= surface.width
      ? hovered
      : null

  if (marks.length === 0 || (!showArrows && !focusedTrade)) return null

  const entryY = focusedTrade ? surface.yOf(focusedTrade.entryPx) : null
  const exitY = focusedTrade ? surface.yOf(focusedTrade.exitPx) : null
  const stopY =
    focusedTrade?.stopPx == null ? null : surface.yOf(focusedTrade.stopPx)
  const fromX = focusedTrade
    ? surface.xOfContainingBar(focusedTrade.openedAt)
    : 0
  const toX = focusedTrade
    ? surface.xOfContainingBar(focusedTrade.closedAt)
    : 0

  return (
    <>
      <svg
        width={surface.width}
        height={surface.height}
        className="absolute top-0 left-0"
        // Nothing here is a control, and a chart is not something a screen
        // reader can read. The same trade is in the table below, in words.
        aria-hidden="true"
      >
        {/* Where the stop was. Drawn first, so an arrow sits over it rather
            than under it, and dashed so it is never mistaken for a price the
            market actually traded at. */}
        {stopY !== null ? (
          <>
            <line
              x1={fromX}
              y1={stopY}
              x2={toX}
              y2={stopY}
              className="text-red-600 dark:text-red-400"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeDasharray="5 3"
            />
            <text
              x={Math.max(4, Math.min(fromX + 4, surface.width - 60))}
              y={stopY - 5}
              className="fill-red-600 text-[10px] font-medium dark:fill-red-400"
            >
              Stop
            </text>
          </>
        ) : null}

        {/* In to out. Just the line: the numbers are already on the row and on
            the arrows, so the only thing left for the chart to say is where. */}
        {focusedTrade && entryY !== null && exitY !== null ? (
          <line
            x1={fromX}
            y1={entryY}
            x2={toX}
            y2={exitY}
            className={
              focusedTrade.pnl >= 0
                ? "text-teal-600 dark:text-teal-400"
                : "text-red-600 dark:text-red-400"
            }
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        ) : null}

        {(showArrows ? marks : []).map(({ id, tradeId, mark }) => {
          const y = surface.yOf(mark.px)
          if (y === null) return null
          // A candle owns the whole interval from its open until the next
          // candle. The fill keeps its exact time for its label and history,
          // but its arrow belongs at the centre of that candle.
          const x = surface.xOfContainingBar(mark.at)
          if (x < -OFF_SCREEN || x > surface.width + OFF_SCREEN) return null

          return (
            <g key={id}>
              {/* The exact price, as a hairline. The arrow says which way and
                  is easy to see; this says WHERE, to the pixel. */}
              <line
                x1={x - TICK_HALF}
                y1={y}
                x2={x + TICK_HALF}
                y2={y}
                className={
                  mark.side === "buy"
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-red-600 dark:text-red-400"
                }
                stroke="currentColor"
                strokeWidth={1}
              />
              <polygon
                data-slot="trade-fill-mark"
                data-trade-id={tradeId}
                points={arrow(x, y, mark.side)}
                className={
                  mark.side === "buy"
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-red-600 dark:text-red-400"
                }
                fill="currentColor"
                // Only the arrow takes the pointer; everything between them is
                // still the chart's to pan and zoom.
                style={{ pointerEvents: "all", cursor: "default" }}
                onPointerEnter={() => setHovered({ mark, x, y })}
                onPointerLeave={() => setHovered(null)}
              />
            </g>
          )
        })}
      </svg>

      {onPlot ? (
        <div
          className={cn(
            "pointer-events-none absolute flex -translate-x-1/2 items-center gap-2",
            "rounded-lg border bg-popover px-2.5 py-1.5 whitespace-nowrap shadow-md"
          )}
          style={{
            left: clamp(
              onPlot.x,
              LABEL_HALF_WIDTH,
              Math.max(LABEL_HALF_WIDTH, surface.width - LABEL_HALF_WIDTH)
            ),
            // Under a buy's arrow and over a sell's, so the label never covers
            // the candle the arrow is pointing at — then kept inside the plot,
            // because a label clipped by the edge reads as nothing happening.
            top: clamp(
              onPlot.mark.side === "buy"
                ? onPlot.y + GAP + HEAD + STEM + 6
                : onPlot.y - GAP - HEAD - STEM - LABEL_HEIGHT,
              0,
              Math.max(0, surface.height - LABEL_HEIGHT)
            ),
          }}
        >
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              onPlot.mark.side === "buy"
                ? "bg-teal-600 dark:bg-teal-400"
                : "bg-red-600 dark:bg-red-400"
            )}
          />
          <span className="grid gap-0.5 leading-tight">
            <span className="text-sm font-semibold">{onPlot.mark.label}</span>
            {onPlot.mark.detail ? (
              <span className="text-xs text-muted-foreground">
                {onPlot.mark.detail}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </>
  )
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
