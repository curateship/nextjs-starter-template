import * as React from "react"
import { BookOpenIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { TradesTable } from "@/components/trade/positions-table"
import { stickyPanelTableHeaderClassName } from "@/lib/layout/panel-section-bar"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { PnlJournalPage } from "@/lib/api/trade/pnl"
import type { MarketRow } from "@/lib/protocols/contracts"
import { unmatchedTradeHistories } from "@/lib/trade/live-trades"

const NO_MARKETS: ReadonlyMap<string, MarketRow> = new Map()

/**
 * The Journal at full height, across every exchange and every wallet.
 *
 * The very same rows the bottom panel draws (`TradesTable`), read-only: this
 * page has no chart to draw a trade on and no bin, because removing a trade
 * is a decision made beside the chart it is drawn on. Practice rows sit in
 * the list badged, as they do there; only the grid and the cards leave them
 * out.
 *
 * Nothing here knows what the exchanges are holding right now, so a History
 * incomplete row cannot say whether its position is still open. The row's
 * mark says so.
 */
export function PnlJournalPanel({
  journal,
  wallets,
  olderBusy,
  olderDone,
  onLoadOlder,
}: {
  journal: PnlJournalPage
  wallets: readonly { id: string; label: string }[]
  olderBusy: boolean
  olderDone: boolean
  onLoadOlder: () => void
}) {
  const walletNames = React.useMemo(
    () => new Map(wallets.map((wallet) => [wallet.id, wallet.label])),
    [wallets]
  )
  const walletName = React.useCallback(
    (walletId: string) => walletNames.get(walletId) ?? "another wallet",
    [walletNames]
  )
  const unmatched = React.useMemo(
    () => unmatchedTradeHistories(journal.fills, []),
    [journal.fills]
  )
  const trades = journal.trades.length

  return (
    <>
      <DashboardCardTitleHeader
        icon={<BookOpenIcon />}
        title="Journal"
        meta={`${trades.toLocaleString()} ${trades === 1 ? "trade" : "trades"}${unmatched.length ? `, ${unmatched.length} incomplete` : ""}`}
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {/* The same scrolling box the bottom panel's tables use: one viewport
            that scrolls both ways, with the heading stuck to its top. */}
        <div
          data-slot="table-container"
          className={cn(
            "relative w-full overflow-visible [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10",
            stickyPanelTableHeaderClassName
          )}
        >
          <TradesTable
            readOnly
            trades={journal.trades}
            unmatchedHistory={unmatched}
            markets={NO_MARKETS}
            walletName={walletName}
            selectedId={null}
            busy={false}
            settled
            failed={false}
            onRetry={() => undefined}
            onLoadOlder={onLoadOlder}
            olderBusy={olderBusy}
            olderDone={olderDone}
          />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </>
  )
}
