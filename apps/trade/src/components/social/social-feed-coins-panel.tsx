import { TrendingUpIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing } from "@/lib/layout/focus-ring"
import type { SocialMarketRow } from "@/lib/trade/social/dashboard"
import { cn } from "@/lib/utils"

/**
 * The coins the feed's scope names, most-named first, counted over everything
 * the scope holds rather than over the page on screen.
 *
 * Clicking one narrows the feed to posts naming it; clicking it again clears
 * it. The counts are asked again whenever the scope changes, and the header
 * says what they cover — "Everyone", a folder's name, a handle — because a
 * figure that does not name its folder is a wrong figure waiting to happen.
 *
 * Plain rows, not the dashboard `Table`: that table forces a 320px minimum
 * and clips inside a panel somebody has dragged narrow.
 */
export function SocialFeedCoinsPanel({
  coins,
  scopeName,
  selected,
  onSelect,
}: {
  coins: SocialMarketRow[]
  /** What the counts cover: "Everyone", the folder's name, or "@handle". */
  scopeName: string
  selected: string | null
  onSelect: (coin: string | null) => void
}) {
  return (
    <>
      <DashboardCardTitleHeader
        icon={<TrendingUpIcon />}
        title="Coins"
        meta={scopeName}
      />
      <ScrollArea className="min-h-0 flex-1">
        {coins.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No post in this view names a coin Trade has a market for.
          </p>
        ) : (
          <div>
            {coins.map((row) => (
              <CoinLine
                key={row.market}
                row={row}
                selected={selected === row.market}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </>
  )
}

function CoinLine({
  row,
  selected,
  onSelect,
}: {
  row: SocialMarketRow
  selected: boolean
  onSelect: (coin: string | null) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(selected ? null : row.market)}
      className={cn(
        "flex h-9 w-full min-w-0 items-center gap-2 border-r-2 px-3 text-left",
        focusRing,
        selected
          ? "border-r-foreground bg-muted"
          : "border-r-transparent hover:bg-muted/50"
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        ${row.market}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {row.posts}
      </span>
    </button>
  )
}
