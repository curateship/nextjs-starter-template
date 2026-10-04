import { PinnedMarketChips } from "@/components/trade/pinned-markets-header"
import { useIsMobile } from "@/hooks/use-mobile"
import type { AppHeaderActionProps } from "@/lib/app-options"
import { usePinnedMarkets } from "@/lib/trade/use-pinned-markets"

/**
 * The pinned markets inside the header's three-dot dropdown, on a phone only.
 *
 * They are drawn along the header itself on anything wider, by
 * `pinned-markets-header.tsx`, so this draws nothing there. Both read the same
 * store, so the figures are the same figures and nothing is asked for twice.
 */
export default function PinnedMarketsMenu(_props: AppHeaderActionProps) {
  const phone = useIsMobile()
  const { pins } = usePinnedMarkets()
  if (!phone) return null
  // The shell draws the "Pinned markets" heading above this, from the
  // control's own name, and it draws it whether or not anything is pinned. So
  // an empty list says so here rather than leaving a heading over a gap.
  if (!pins.length) {
    return (
      <p className="px-1 py-1 text-sm text-muted-foreground">
        Nothing pinned yet. The pin beside a market&apos;s name puts it here.
      </p>
    )
  }
  return <PinnedMarketChips alwaysShowChange className="max-w-full min-w-0" />
}
