import { Loader2Icon } from "lucide-react"

import { ActiveTradesDropdown } from "@/components/trade/active-trades-dropdown"
import {
  useActiveTrades,
  useHiddenTradeColumns,
} from "@/components/trade/use-active-trades"
import { ErrorRow } from "@/components/ui/error-row"
import { cn } from "@/lib/utils"

/**
 * The table's look in a narrow place, the header's popover and a phone's
 * Positions panel alike: the full width, tighter cells than the same table
 * gets on a full-width page, and a ticker longer than 144px cut short, while
 * nothing else ever is. A clipped ticker is still readable and its full name
 * is on the chart one click away; a clipped figure is money with a digit
 * missing.
 */
const COMPACT_TABLE = cn(
  "[&_[data-slot=table-container]]:w-full [&_table]:w-full",
  "[&_[data-slot=table-cell]]:px-2.5 [&_[data-slot=table-head]]:px-2.5",
  "[&_tbody_td:first-child]:max-w-36",
  "[&_tbody_td:first-child>span]:min-w-0",
  "[&_tbody_td:first-child_button]:min-w-0 [&_tbody_td:first-child_button]:truncate",
  "[&_tbody_td:first-child>span>span]:truncate"
)

/**
 * The Active trades panel's body: Active trades and Watching as tabs, the
 * Filter and the ⋮ that hides columns, or why the list is not there yet. The
 * header button draws it in its popover, and the bottom bar's Positions panel
 * draws it straight into the page.
 */
export function ActiveTradesPanelBody({
  className,
  onTradeOpen,
}: {
  className?: string
  /** A trade's row was pressed; its chart is opening. */
  onTradeOpen?: () => void
}) {
  const { snapshot, failed, refresh } = useActiveTrades()
  const columns = useHiddenTradeColumns()
  if (snapshot) {
    return (
      <ActiveTradesDropdown
        snapshot={snapshot}
        hidden={columns.hidden}
        onHiddenChange={columns.change}
        className={cn(COMPACT_TABLE, className)}
        onTradeOpen={onTradeOpen}
      />
    )
  }
  if (failed) {
    return (
      <ErrorRow
        message="Active trades could not be read."
        onRetry={() => void refresh()}
        className="p-4 text-sm"
      />
    )
  }
  return (
    <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" />
      Reading active trades
    </div>
  )
}
