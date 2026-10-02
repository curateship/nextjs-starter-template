import { Loader2Icon, RefreshCwIcon, TrendingUpIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { SocialMarketRows } from "@/components/social/social-market-rows"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { SocialMarketRow } from "@/lib/trade/social/dashboard"

/**
 * The markets this creator names, most-named first.
 *
 * Clicking one narrows the middle panel to that market; clicking it again
 * clears the filter, so the panel is a filter rather than a place you have to
 * navigate back out of.
 *
 * **The counts are Trade's own reading of the words**, and only markets Trade
 * lists, so something nobody here lists can never appear. The count is over
 * every post held, not over the page on screen.
 *
 * **Coins unless the member asked for more.** Stocks, metals and currencies
 * are behind the switch in Settings → Social, and they arrive as their own
 * groups in the list. `social-market-rows.tsx` draws the groups and the
 * market-hours note.
 *
 * **Re-read markets is in this panel's header** rather than beside Sync
 * profile, because Sync profile asks X for posts and this asks nothing of
 * anybody: it reads words Trade already has, under whatever the match rules
 * say today.
 */

/**
 * The words on the re-read button.
 *
 * **Icon only**, because this panel opens at 16% of the window and "Markets",
 * the market count and a worded button do not fit in 171 pixels: measured on
 * 29 Sep 2026, the worded version pushed its own right edge 7 pixels past the
 * window at 1280px wide. The words are the tooltip and the accessible name.
 */
const REREAD_LABEL = "Read every post's words again for markets"

/**
 * The header carries no market count any more. The button took its room: at
 * the panel's narrowest the title, the count and the button together cut
 * "Markets" down to "Ma…", and the panel below already lists everything.
 */

export function SocialMarketsPanel({
  markets,
  selected,
  onSelect,
  onReread,
  rereading,
  now,
}: {
  markets: SocialMarketRow[]
  selected: string | null
  onSelect: (market: string | null) => void
  /** Read every held post's words again under today's match rules. */
  onReread: () => void
  rereading: boolean
  /** The server's own clock, which market hours are read against. */
  now: number
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
            No post held for this creator names a market Trade lists. Sync the
            profile, and anything they name shows up here.
          </p>
        ) : (
          <SocialMarketRows
            rows={markets}
            selected={selected}
            onSelect={onSelect}
            now={now}
          />
        )}
      </ScrollArea>
    </>
  )
}
