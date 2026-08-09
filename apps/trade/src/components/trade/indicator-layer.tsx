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
 * the word "base" — it draws dashes and arrows, and something else decides
 * what they mean.
 *
 * It takes no clicks at all. An indicator is something to look at, not
 * something to take hold of: the layer stays see-through so the chart
 * underneath still pans, zooms and shows its crosshair straight through it,
 * and so a drawn line or a stop under a dash is still the thing the pointer
 * finds.
 */

/** How thick a level's mark is drawn. Thicker than a drawn line, on purpose. */
const DASH_WIDTH = 3

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

/** The triangle for one arrow — under the candle for up, over it for down. */
function arrowPoints(x: number, y: number, side: IndicatorSide): string {
  const tip = side === "up" ? y + ARROW_GAP : y - ARROW_GAP
  const back = side === "up" ? tip + ARROW_HEIGHT : tip - ARROW_HEIGHT
  return `${x},${tip} ${x - ARROW_HALF_WIDTH},${back} ${x + ARROW_HALF_WIDTH},${back}`
}

export function IndicatorLayer({
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
}
