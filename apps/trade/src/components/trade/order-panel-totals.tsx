import { useShownColumns } from "@/components/trade/block-columns"
import { PnlAmount } from "@/components/trade/pnl-amount"
import { TableCell, TableRow } from "@/components/ui/table"
import { stickyPanelSectionBarClassName } from "@/lib/layout/panel-section-bar"
import { formatSignedUsd, formatWholeUsd } from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

/**
 * The row under the Grid, DCA and Manual orders tables (Tyler, 8 Oct 2026):
 * how many trades the table lists, in place of the word Total, then what
 * they are worth together and what they have made or lost together, each sum
 * under its own column.
 *
 * It pins to the bottom of the panel while the rows scroll, the way the
 * Positions total does, so the sums are read without scrolling to the end.
 * The three tables share the same four columns, so one footer fits all three.
 *
 * No line above or below it (Tyler, 10 Nov 2026: "Remove footer borders"):
 * its shade alone sets it apart from the rows. The shared bar's `border-y` and
 * the table row's own bottom line are both taken off here, so the Positions
 * total, which wears the same bar, keeps its lines.
 */
export function OrderPanelTotals({
  count,
  value,
  pnl,
}: {
  /** How many rows the table lists. */
  count: number
  /** The rows' values added up, or null when a row has no value yet. */
  value: number | null
  /** The rows' profit added up, or null when no row has a profit yet. */
  pnl: number | null
}) {
  // Each sum stays under its own heading when the block hides a column.
  const shows = useShownColumns()
  return (
    <tfoot className="sticky bottom-0 z-10" data-order-panel-totals>
      <TableRow className={cn(stickyPanelSectionBarClassName, "border-0")}>
        {/* Wraps onto a second line in a narrow block, so the count never
            runs into the Value sum once the block hides Type. */}
        <TableCell className="py-2 pr-2 pl-1 text-xs font-medium whitespace-normal text-muted-foreground">
          {count} {count === 1 ? "trade" : "trades"}
        </TableCell>
        {shows("type") ? <TableCell className="px-1 py-2" aria-hidden /> : null}
        {shows("value") ? (
        <TableCell className="px-1 py-2 font-mono text-xs font-medium tabular-nums">
          <span className="text-muted-foreground">
            {value === null ? (
              <span title="A complete total is unavailable because a row has no value yet.">
                —
              </span>
            ) : (
              formatWholeUsd(value)
            )}
          </span>
        </TableCell>
        ) : null}
        {shows("pnl") ? (
        <TableCell className="px-1 py-2 font-mono text-xs tabular-nums">
          {pnl === null ? (
            <span
              className="text-muted-foreground"
              title="Nothing listed here has made or lost anything yet."
            >
              —
            </span>
          ) : (
            <PnlAmount className={cn("font-medium", moneyTone(pnl))}>
              {formatSignedUsd(pnl)}
            </PnlAmount>
          )}
        </TableCell>
        ) : null}
      </TableRow>
    </tfoot>
  )
}
