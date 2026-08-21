import * as React from "react"

import type { ChartSurface } from "@/components/trade/price-chart"
import type {
  IndicatorPaint,
  IndicatorSide,
} from "@/lib/trade/indicators/contract"

/**
 * What the switched-on indicators draw, over the candles.
 *
 * Everything here is in the chart's coordinates and nothing here is in the
 * chart's code: it is handed a surface that answers "where does this time and
 * this price land?" and shapes to put there, and it draws SVG on top. The
 * chart has never heard the word "indicator", and this file has never heard
 * the word "base" — it draws dashes, arrows and boxes, and something else
 * decides what they mean.
 *
 * It takes no clicks at all. An indicator is something to look at, not
 * something to take hold of: the layer stays see-through so the chart
 * underneath still pans, zooms and shows its crosshair straight through it,
 * and so a drawn line or a stop under a dash is still the thing the pointer
 * finds.
 */

/** How thick a level's mark is drawn. Thicker than a drawn line, on purpose. */
const DASH_WIDTH = 3

/**
 * How solid the two kinds of box are.
 *
 * **A band is a tint and a box is an outline.** A band runs the whole height of
 * the chart behind everything, so it has to be faint enough that a chart with
 * five of them on it still reads as candles — the moment it competes with them
 * it is doing harm.
 *
 * A box is found by its EDGE, not by its fill. It sits over a handful of
 * candles — often only one or two — and those candles are the whole reason for
 * drawing it, so a fill strong enough to be seen on its own is a fill that has
 * swallowed what it was pointing at. The edge does the being-seen; the fill only
 * has to say which side of the edge is inside.
 */
const BAND_FILL_OPACITY = 0.06
const BOX_FILL_OPACITY = 0.07
const BOX_EDGE_WIDTH = 1.5

/** The arrow: how far off the candle's close it sits, and how big it is. */
const ARROW_GAP = 9
const ARROW_HEIGHT = 9
const ARROW_HALF_WIDTH = 5

/**
 * How far outside the plot a shape may reach before it is left out entirely.
 *
 * A chart zoomed into a day of a year's candles has hundreds of levels off
 * either side, and every one of them would otherwise be an element the browser
 * lays out, clips, and paints nothing of.
 */
const OFF_SCREEN = 40

function colorOf(side: IndicatorSide): string {
  // Teal rather than the candles' own green, so a level never reads as a
  // candle; red is the same red the down candles and the ruler use.
  return side === "up"
    ? "text-teal-600 dark:text-teal-400"
    : "text-red-600 dark:text-red-400"
}

/**
 * A box's own colour: violet, and nothing else on the chart is.
 *
 * Not teal and not red, because those two already mean up and down here and a
 * range is neither — it is the stretch the answer came out of. Not green,
 * because the candles are. Not blue, because the entry line is.
 */
const BOX_COLOR = "text-violet-600 dark:text-violet-400"

/** A band is not a colour, it is a shade. It has to work over any candle. */
const BAND_COLOR = "text-foreground"

/** The triangle for one arrow — under the candle for up, over it for down. */
function arrowPoints(x: number, y: number, side: IndicatorSide): string {
  const tip = side === "up" ? y + ARROW_GAP : y - ARROW_GAP
  const back = side === "up" ? tip + ARROW_HEIGHT : tip - ARROW_HEIGHT
  return `${x},${tip} ${x - ARROW_HALF_WIDTH},${back} ${x + ARROW_HALF_WIDTH},${back}`
}

/**
 * Drawn only when the levels or the view actually change.
 *
 * **Because the number of shapes here follows the number of candles.** The
 * four-hour chart carries every bar the exchange has since 20 Aug 2026, and
 * on a long history the base rule finds 376 levels and 189 arrows where five
 * hundred bars found 21 and 11 — eighteen times the shapes. Each one asks the
 * chart library where its price and time land, so rebuilding this because
 * something unrelated on the page moved is thousands of those questions for
 * an unchanged picture. Everything it needs is already worked out elsewhere
 * and handed in, so skipping is always safe.
 */
export const IndicatorLayer = React.memo(function IndicatorLayer({
  surface,
  paint,
}: {
  surface: ChartSurface
  paint: IndicatorPaint
}) {
  /**
   * Whether anything between these two positions can be seen.
   *
   * Both ends, together, and never each end on its own: a dash zoomed in on
   * until it is wider than the screen has both ends past an edge, and asking
   * "is either end visible?" would answer no and drop the one level filling
   * the chart.
   */
  const onPlot = (from: number, to = from) =>
    Math.max(from, to) > -OFF_SCREEN &&
    Math.min(from, to) < surface.width + OFF_SCREEN

  return (
    <svg
      width={surface.width}
      height={surface.height}
      className="absolute top-0 left-0"
      // Nothing here is a control, and a chart is not something a screen
      // reader can read anyway. The market's own figures are in the header.
      aria-hidden="true"
    >
      {/* Bands first and boxes after, so the range always sits ON its session
          rather than under it. Both come out of `paint.boxes` in the order the
          indicators built them; sorting here is what makes the stack a rule
          instead of an accident of who ran first. */}
      {[...paint.boxes]
        .sort((a, b) => Number(a.price !== null) - Number(b.price !== null))
        .map((box, index) => {
          const x1 = surface.xOf(box.fromTime)
          const x2 = surface.xOf(box.toTime)
          if (!onPlot(x1, x2)) return null
          // The times a box carries are its span — the open of the first candle
          // it covers to the end of the last — and the chart puts a time at the
          // CENTRE of its candle. Half a bar to the left of both edges is what
          // turns that into a box sitting over the candles rather than one
          // shifted half a candle to the right of them.
          const bars = surface.barAt(box.toTime) - surface.barAt(box.fromTime)
          const halfBar = bars > 0 ? (x2 - x1) / bars / 2 : 0
          const left = Math.min(x1, x2) - halfBar
          const width = Math.abs(x2 - x1)

          if (box.price === null) {
            return (
              <rect
                // The position in the list, not the time alone: two
                // indicators shading the same hours would otherwise hand two
                // shapes the same key, and React would keep the wrong one.
                key={`band-${index}-${box.fromTime}`}
                x={left}
                y={0}
                width={width}
                height={surface.height}
                className={BAND_COLOR}
                fill="currentColor"
                fillOpacity={BAND_FILL_OPACITY}
              />
            )
          }

          const top = surface.yOf(box.price.high)
          const bottom = surface.yOf(box.price.low)
          if (top === null || bottom === null) return null
          return (
            <rect
              key={`box-${index}-${box.fromTime}`}
              x={left}
              y={Math.min(top, bottom)}
              width={width}
              height={Math.abs(bottom - top)}
              className={BOX_COLOR}
              fill="currentColor"
              fillOpacity={BOX_FILL_OPACITY}
              stroke="currentColor"
              strokeWidth={BOX_EDGE_WIDTH}
            />
          )
        })}

      {paint.dashes.map((dash) => {
        const y = surface.yOf(dash.price)
        if (y === null) return null
        const x1 = surface.xOf(dash.fromTime)
        const x2 = surface.xOf(dash.toTime)
        if (!onPlot(x1, x2)) return null
        return (
          <line
            // The level itself, at the candles it was found on: two levels at
            // the same price on different candles are two marks, and a mark
            // that has not moved between frames keeps the element it had.
            key={`${dash.side}-${dash.fromTime}-${dash.price}`}
            x1={x1}
            y1={y}
            x2={x2}
            y2={y}
            className={colorOf(dash.side)}
            stroke="currentColor"
            strokeWidth={DASH_WIDTH}
            strokeLinecap="round"
          />
        )
      })}

      {paint.marks.map((mark) => {
        const y = surface.yOf(mark.price)
        if (y === null) return null
        const x = surface.xOf(mark.time)
        if (!onPlot(x)) return null
        return (
          <polygon
            key={`${mark.side}-${mark.time}`}
            points={arrowPoints(x, y, mark.side)}
            className={colorOf(mark.side)}
            fill="currentColor"
          />
        )
      })}
    </svg>
  )
})
