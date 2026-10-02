import { TrendingUpIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { SocialMarketRows } from "@/components/social/social-market-rows"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SocialMarketRow } from "@/lib/trade/social/dashboard"

/**
 * The markets the feed's scope names, most-named first, counted over
 * everything the scope holds rather than over the page on screen.
 *
 * Clicking one narrows the feed to posts naming it; clicking it again clears
 * it. The counts are asked again whenever the scope changes, and the header
 * says what they cover — "Everyone", a folder's name, a handle — because a
 * figure that does not name its folder is a wrong figure waiting to happen.
 *
 * The rows, their groups and the market-hours note are
 * `social-market-rows.tsx`, the same list the creator dashboard draws.
 */
export function SocialFeedCoinsPanel({
  coins,
  scopeName,
  selected,
  onSelect,
  now,
}: {
  coins: SocialMarketRow[]
  /** What the counts cover: "Everyone", the folder's name, or "@handle". */
  scopeName: string
  selected: string | null
  onSelect: (coin: string | null) => void
  /** The server's own clock, which market hours are read against. */
  now: number
}) {
  return (
    <>
      <DashboardCardTitleHeader
        icon={<TrendingUpIcon />}
        // The panel's id stays "coins", because a saved panel layout is keyed
        // by it. Only the word on screen moved, so a panel listing TSLA is not
        // titled Coins.
        title="Markets"
        meta={scopeName}
      />
      <ScrollArea className="min-h-0 flex-1">
        {coins.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No post in this view names a market Trade lists.
          </p>
        ) : (
          <SocialMarketRows
            rows={coins}
            selected={selected}
            onSelect={onSelect}
            now={now}
          />
        )}
      </ScrollArea>
    </>
  )
}
