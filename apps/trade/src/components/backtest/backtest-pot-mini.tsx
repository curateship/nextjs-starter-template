import {
  graphView,
  linePath,
  potHeight,
  potScale,
  type GraphSeries,
  type GraphWindow,
} from "@/lib/trade/backtest/graph"

/**
 * The whole run at a glance, under the tiles, with two bands drawn over it:
 * a faint one for what the big graph is showing, and a teal one for the
 * stretch the figures above are answering for.
 *
 * **Its job is to say where you are.** Once a drag has scoped the page to three
 * weeks in February, every figure on the panel is about three weeks in February
 * and nothing else on screen says where in the run that is. This does. Clicking
 * it puts the whole run back.
 *
 * Drawn by hand rather than with Recharts, like the big graph and for the same
 * reason: the two bands are the entire point and there is no chart library
 * shape for "the part I am asking about".
 */

const WIDTH = 296
const HEIGHT = 80

export function BacktestPotMini({
  series,
  window,
  onReset,
}: {
  series: GraphSeries
  window: GraphWindow
  onReset: () => void
}) {
  const { usd } = series
  if (usd.length < 2) return null

  const last = usd.length - 1
  const { view, stats } = graphView(series, window)
  const scale = potScale(usd, 0, last)

  // Edge to edge, with no inset. Three units of padding either side sounds like
  // nothing until `preserveAspectRatio="none"` stretches the box to the panel's
  // width: it became a visible white gutter inside the border, and the line
  // stopped short of both ends as if the run had.
  const xOf = (bar: number) => (bar / last) * WIDTH
  // The same scale rule and the same striding as the big graph, from the same
  // file — see `potHeight` and `linePath`.
  const yOf = potHeight(scale, HEIGHT - 4, HEIGHT - 10)
  const line = linePath(usd, 0, last, xOf, yOf)
  const area = linePath(usd, 0, last, xOf, yOf, HEIGHT)

  const scoped = stats[0] !== 0 || stats[1] !== last

  return (
    <section className="grid gap-1.5">
      <button
        type="button"
        onClick={onReset}
        title="Back to the whole run"
        className="overflow-hidden rounded-lg border bg-muted/20 text-foreground"
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block h-20 w-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* What the graph is drawing, when that is less than everything. */}
          <rect
            x={xOf(view[0])}
            y={0}
            width={Math.max(0, xOf(view[1]) - xOf(view[0]))}
            height={HEIGHT}
            fill="currentColor"
            fillOpacity={0.04}
          />
          {scoped ? (
            <rect
              x={xOf(stats[0])}
              y={0}
              width={Math.max(0, xOf(stats[1]) - xOf(stats[0]))}
              height={HEIGHT}
              className="fill-teal-600/20 dark:fill-teal-400/20"
            />
          ) : null}
          <path d={area} fill="currentColor" fillOpacity={0.08} />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.1}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </button>
    </section>
  )
}
