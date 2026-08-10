import * as React from "react"

import type { ChartSurface } from "@/components/trade/price-chart"
import type { BacktestFillMark } from "@/lib/trade/backtest/result"
import { cn } from "@/lib/utils"

/**
 * Every fill the run made, drawn over its candles.
 *
 * **One arrow per fill**, at the exact price and moment it happened — a green
 * one under the bar for a buy, a red one over it for a sell. That is what the
 * old app draws and it is the right picture: a ladder that bought five times
 * and sold once really did five things at five prices, and one blended entry
 * per round trip hides the whole shape of a ladder, which is the thing you
 * opened the chart to look at.
 *
 * Pointing at an arrow says which rung it was and what it cost. The words are
 * worked out when the run is saved, not here — the chart has never heard of a
 * ladder.
 *
 * The same idiom as `indicator-layer.tsx`: handed a surface that answers "where
 * does this time and this price land?", it draws on top, and `price-chart.tsx`
 * is never edited. Only the arrows take the pointer, so the chart still pans,
 * zooms and shows its crosshair everywhere between them.
 */

/**
 * How far off the price the arrow's tip sits, and how big the arrow is.
 *
 * The gap is small on purpose and the tick below is why: an arrow is nineteen
 * pixels of ink and the eye reads its BODY, not its tip, so a sell drawn above
 * its own price looks like it happened one or two percent higher than it did.
 * On a ladder that matters — the whole question is whether a sell landed
 * exactly on the rung above it.
 */
const GAP = 2

/** Half the width of the hairline drawn at the exact fill price. */
const TICK_HALF = 9
const HEAD = 9
const HEAD_HALF = 7
const STEM = 7
const STEM_HALF = 2.5

/** How far outside the plot an arrow may reach before it is left out entirely. */
const OFF_SCREEN = 40

/**
 * A solid arrow — a wide head on a short stem, the shape a trading chart marks
 * a fill with. A bare triangle reads as a scale tick; this reads as an arrow
 * pointing at a price.
 */
function arrow(x: number, y: number, side: "buy" | "sell"): string {
  // Up for a buy, down for a sell: `d` is 1 when the arrow grows downwards.
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

/** Where the label goes, kept inside the plot so an edge never clips it. */
const LABEL_HALF_WIDTH = 100
const LABEL_HEIGHT = 52

type Hovered = { mark: BacktestFillMark; x: number; y: number }

export function BacktestMarksLayer({
  surface,
  fills,
  barMs,
}: {
  surface: ChartSurface
  fills: readonly BacktestFillMark[]
  /**
   * How long one candle lasts.
   *
   * The engine stamps a fill at the **close** of the bar it happened in, which
   * is the same instant as the NEXT bar's open — so asking the chart where
   * that moment is puts every arrow one candle to the right of the candle it
   * belongs to. Stepping back one bar puts it on its own candle.
   */
  barMs: number
}) {
  const [hovered, setHovered] = React.useState<Hovered | null>(null)

  // The arrow under the pointer belongs to the candles on screen. Panning away
  // from it must take its label with it rather than leaving one floating over a
  // price it has nothing to do with.
  const onPlot =
    hovered && hovered.x >= 0 && hovered.x <= surface.width ? hovered : null

  return (
    <>
      <svg
        width={surface.width}
        height={surface.height}
        className="absolute top-0 left-0"
        // Nothing here is a control, and a chart is not something a screen
        // reader can read. The same fills are in the table below, in words.
        aria-hidden="true"
      >
        {fills.map((fill, index) => {
          const y = surface.yOf(fill.px)
          if (y === null) return null
          const x = surface.xOf(fill.at - barMs)
          if (x < -OFF_SCREEN || x > surface.width + OFF_SCREEN) return null

          return (
            <g key={`${fill.at}-${fill.side}-${index}`}>
              {/* The exact price, as a hairline. The arrow says which way and
                  is easy to see; this says WHERE, to the pixel. */}
              <line
                x1={x - TICK_HALF}
                y1={y}
                x2={x + TICK_HALF}
                y2={y}
                className={
                  fill.side === "buy"
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-red-600 dark:text-red-400"
                }
                stroke="currentColor"
                strokeWidth={1}
              />
              <polygon
                points={arrow(x, y, fill.side)}
                // The candles' own pair, so an arrow never reads as the wrong
                // side of the trade.
                className={
                  fill.side === "buy"
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-red-600 dark:text-red-400"
                }
                fill="currentColor"
                // Only the arrow takes the pointer; everything between them is
                // still the chart's to pan and zoom.
                style={{ pointerEvents: "all", cursor: "default" }}
                onPointerEnter={() => setHovered({ mark: fill, x, y })}
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
          {/* Two lines: the money on top, the detail under it. Both are worked
              out when the run is saved — the chart has never heard of a rung. */}
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
