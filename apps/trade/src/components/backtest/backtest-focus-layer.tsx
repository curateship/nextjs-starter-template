import type { ChartSurface } from "@/components/trade/price-chart"
import type { BacktestTrade } from "@/lib/trade/backtest/result"

/**
 * A dotted line from where each rung bought to where it sold — for EVERY round
 * trip on the chart, not just the picked one.
 *
 * It used to draw only the picked trade, and the page picks the first trade by
 * itself when a coin opens — so the chart showed one line and left every other
 * exit hanging: arrows with nothing joining the buy to the sell that took it
 * out. A stop that closed three rungs is three round trips sharing one exit
 * arrow, and each of them gets its own line too.
 *
 * The picked trade still stands out: its exit's lines are drawn at full
 * strength and everything else steps back, so clicking a row reads as "look at
 * this one" rather than adding or removing information.
 *
 * Deliberately just the lines. The old app drew a filled box with the percent
 * and the dollars in the middle of it, and on this chart that covers the very
 * candles you clicked the row to look at. The numbers are already two places —
 * on the row itself, and on the arrow when you point at it — so the only thing
 * left for the chart to say is *where*, and a line says it without hiding
 * anything.
 *
 * Same idiom as every other layer here: handed a surface, draws on top, takes
 * no clicks, and `price-chart.tsx` never hears about it.
 */
export function BacktestFocusLayer({
  surface,
  trades,
  focus,
}: {
  surface: ChartSurface
  /** Every round trip on this coin. Open ones draw nothing — there is no exit yet. */
  trades: readonly BacktestTrade[]
  /** The picked trade and the other rungs its exit closed; empty when nothing is picked. */
  focus: readonly BacktestTrade[]
}) {
  const lines = trades.filter(
    (trade): trade is BacktestTrade & { exitAt: number; exitPx: number } =>
      trade.exitAt !== null && trade.exitPx !== null
  )
  if (lines.length === 0) return null

  const picked = new Set(focus.map((trade) => trade.n))

  return (
    <svg
      width={surface.width}
      height={surface.height}
      className="pointer-events-none absolute top-0 left-0"
      aria-hidden="true"
    >
      {lines.map((trade) => {
        const entryY = surface.yOf(trade.entryPx)
        const exitY = surface.yOf(trade.exitPx)
        if (entryY === null || exitY === null) return null
        const isPicked = picked.size === 0 || picked.has(trade.n)
        return (
          <line
            key={trade.n}
            x1={surface.xOf(trade.entryAt)}
            y1={entryY}
            x2={surface.xOf(trade.exitAt)}
            y2={exitY}
            // Green when it made money, red when it lost — the candles' own
            // pair, so each line says which way its rung went without a label.
            className={
              trade.pnl > 0
                ? "text-teal-600 dark:text-teal-400"
                : "text-red-600 dark:text-red-400"
            }
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            opacity={isPicked ? 1 : 0.4}
          />
        )
      })}
    </svg>
  )
}
