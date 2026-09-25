import type { ChartSurface } from "@/components/trade/price-chart"
import type { BacktestTrade } from "@/lib/trade/backtest/result"

/**
 * A dotted line from where each rung bought to where it sold.
 *
 * With no picked trade, every closed round trip is shown. Picking one trade
 * isolates that one line so the other rungs cannot obscure it.
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
  /** The picked trade; empty when every closed trade should be shown. */
  focus: readonly BacktestTrade[]
}) {
  const lines = (focus.length > 0 ? focus : trades).filter(
    (trade): trade is BacktestTrade & { exitAt: number; exitPx: number } =>
      trade.exitAt !== null && trade.exitPx !== null
  )
  if (lines.length === 0) return null

  return (
    <svg
      data-slot="backtest-trade-lines"
      width={surface.width}
      height={surface.height}
      className="pointer-events-none absolute top-0 left-0"
      aria-hidden="true"
    >
      {lines.map((trade) => {
        const entryY = surface.yOf(trade.entryPx)
        const exitY = surface.yOf(trade.exitPx)
        if (entryY === null || exitY === null) return null
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
          />
        )
      })}
    </svg>
  )
}
