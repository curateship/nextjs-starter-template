import type { ChartSurface } from "@/components/trade/price-chart"
import type { BacktestTrade } from "@/lib/trade/backtest/result"

/**
 * The trade picked in the list below: a dotted line from where it bought to
 * where it sold, and nothing else.
 *
 * Deliberately just the line. The old app drew a filled box with the percent
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
  trade,
}: {
  surface: ChartSurface
  /** The picked trade, or null when nothing is picked. */
  trade: BacktestTrade | null
}) {
  if (!trade || trade.exitAt === null || trade.exitPx === null) return null

  const entryY = surface.yOf(trade.entryPx)
  const exitY = surface.yOf(trade.exitPx)
  if (entryY === null || exitY === null) return null

  return (
    <svg
      width={surface.width}
      height={surface.height}
      className="pointer-events-none absolute top-0 left-0"
      aria-hidden="true"
    >
      <line
        x1={surface.xOf(trade.entryAt)}
        y1={entryY}
        x2={surface.xOf(trade.exitAt)}
        y2={exitY}
        // Green when it made money, red when it lost — the candles' own pair,
        // so the line says which way it went without a label.
        className={
          trade.pnl > 0
            ? "text-teal-600 dark:text-teal-400"
            : "text-red-600 dark:text-red-400"
        }
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
    </svg>
  )
}
