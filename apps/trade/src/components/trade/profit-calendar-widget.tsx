import * as React from "react"

import { PnlMonthGrid } from "@/components/pnl/pnl-month-grid"
import { Card } from "@/components/ui/card"
import type { TradingOverview } from "@/lib/trade/dashboard/overview"
import { bucketDays } from "@/lib/trade/pnl/day-buckets"
import { currentMonth } from "@/lib/trade/pnl/periods"
import { walletProfitWindowStart } from "@/lib/trade/wallets"
import { cn } from "@/lib/utils"

/**
 * The P&L page's month grid, as a trading overview widget.
 *
 * It splits the overview's own real fills by Toronto day, so it asks the
 * server for nothing extra and moves with the overview's fifteen-second read.
 * The overview carries fills, not finished trades, so the tiles name dollars
 * and leave the trade count to the P&L page.
 */
export function ProfitCalendarWidget({
  overview,
  className,
  bare = false,
}: {
  overview: TradingOverview
  className: string
  /**
   * Drawn inside the Trade dashboard's widget card, which holds the title
   * and the ⋮: no frame of its own, and no title.
   */
  bare?: boolean
}) {
  const Frame = bare ? "div" : Card
  const [month, setMonth] = React.useState(() =>
    currentMonth(overview.readAt)
  )
  const days = React.useMemo(
    () => bucketDays(overview.fills, [], walletProfitWindowStart()),
    [overview.fills]
  )

  return (
    <Frame className={cn("flex min-h-0 flex-col gap-0 py-0", className)}>
      <PnlMonthGrid
        days={days}
        month={month}
        onMonthChange={setMonth}
        now={overview.readAt}
        countsTrades={false}
      />
    </Frame>
  )
}
