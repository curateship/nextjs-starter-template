import { Loader2Icon, RefreshCwIcon, TrendingUpIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { focusRing } from "@/lib/layout/focus-ring"
import type { SocialMarketRow } from "@/lib/trade/social/dashboard"
import { cn } from "@/lib/utils"

/**
 * The coins this creator names, most-named first.
 *
 * Clicking one narrows the middle panel to that coin; clicking it again clears
 * the filter, so the panel is a filter rather than a place you have to
 * navigate back out of.
 *
 * **The counts are Trade's own reading of the words**, and only coins Trade has
 * a market for, so a coin nobody here trades can never appear. The count is
 * over every post held, not over the page on screen.
 *
 * **Re-read coins is in this panel's header** rather than beside Sync profile,
 * because Sync profile asks X for posts and this asks nothing of anybody: it
 * reads words Trade already has, under whatever the match rules say today.
 *
 * **Built with plain rows, not the dashboard `Table`.** That table forces a
 * 320px minimum and clips inside a panel somebody has dragged narrow. These
 * rows are the market panel's shape instead, which survives any width.
 */
const ROW_COLUMNS = "gap-2 px-3"

/**
 * The words on the re-read button.
 *
 * **Icon only**, because this panel opens at 16% of the window and "Markets",
 * the coin count and a worded button do not fit in 171 pixels: measured on
 * 29 Sep 2026, the worded version pushed its own right edge 7 pixels past the
 * window at 1280px wide. The words are the tooltip and the accessible name.
 */
const REREAD_LABEL = "Read every post's words again for coins"

/**
 * The header carries no coin count any more. The button took its room: at the
 * panel's narrowest the title, the count and the button together cut "Markets"
 * down to "Ma…", and the panel below already lists every coin.
 */

export function SocialMarketsPanel({
  markets,
  selected,
  onSelect,
  onReread,
  rereading,
}: {
  markets: SocialMarketRow[]
  selected: string | null
  onSelect: (market: string | null) => void
  /** Read every held post's words again under today's match rules. */
  onReread: () => void
  rereading: boolean
}) {
  return (
    <>
      <DashboardCardTitleHeader
        icon={<TrendingUpIcon />}
        title="Markets"
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={REREAD_LABEL}
                disabled={rereading}
                onClick={onReread}
              >
                {rereading ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <RefreshCwIcon />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{REREAD_LABEL}</TooltipContent>
          </Tooltip>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        {markets.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No post held for this creator names a coin Trade has a market for.
            Sync the profile, and any coin they name shows up here.
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
