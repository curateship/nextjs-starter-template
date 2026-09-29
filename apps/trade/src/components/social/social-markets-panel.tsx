import { TrendingUpIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRing } from "@/lib/layout/focus-ring"
import { plural } from "@/lib/format/plural"
import type { SocialMarketRow } from "@/lib/trade/social/dashboard"
import { cn } from "@/lib/utils"

/**
 * The coins this creator names, most-named first.
 *
 * Clicking one narrows the middle panel to that coin; clicking it again clears
 * the filter, so the panel is a filter rather than a place you have to
 * navigate back out of.
 *
 * **The counts are X's own tagging, counted up.** X marks the coins in the
 * page it serves, so nothing here is worked out from the words: "$5 a share"
 * is not a coin and neither is a price. The count is over every post held,
 * not over the page on screen.
 *
 * **Built with plain rows, not the dashboard `Table`.** That table forces a
 * 320px minimum and clips inside a panel somebody has dragged narrow. These
 * rows are the market panel's shape instead, which survives any width.
 */
const ROW_COLUMNS = "gap-2 px-3"

export function SocialMarketsPanel({
  markets,
  selected,
  onSelect,
}: {
  markets: SocialMarketRow[]
  selected: string | null
  onSelect: (market: string | null) => void
}) {
  return (
    <>
      <DashboardCardTitleHeader
        icon={<TrendingUpIcon />}
        title="Markets"
        meta={
          markets.length > 0
            ? `${markets.length} ${plural(markets.length, "coin", "coins")}`
            : undefined
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        {markets.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No post names a coin yet. Sync the profile, and any coin this
            creator tags shows up here.
          </p>
        ) : (
          <div>
            {markets.map((row) => (
              <MarketLine
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

function MarketLine({
  row,
  selected,
  onSelect,
}: {
  row: SocialMarketRow
  selected: boolean
  onSelect: (market: string | null) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(selected ? null : row.market)}
      className={cn(
        "flex h-9 w-full min-w-0 items-center border-r-2 text-left",
        ROW_COLUMNS,
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
