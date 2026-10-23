import * as React from "react"

import { ListingGrid } from "@/components/directory/public/listing-grid"
import { Button } from "@/components/ui/button"
import {
  loadRecentlyViewed,
  type PublicListingCard,
} from "@/lib/api/directory/public"
import {
  RECENTLY_VIEWED_SHOWN,
  clearRecentlyViewed,
  readRecentlyViewed,
  rememberViewed,
} from "@/lib/directory/recently-viewed"

/**
 * "Recently viewed": the last few listings this browser opened, as the same
 * cards the browse page draws.
 *
 * On a listing's page it also records that listing, and leaves it out of its
 * own row. It reads the list before recording, so the row never waits on the
 * write and the page being read is never one of its cards.
 *
 * Drawn only in the browser, after the page has loaded: the server has no
 * idea what this browser opened. Until the fresh cards arrive, and whenever
 * there are none, nothing is drawn at all, so a visitor with no history or
 * with storage blocked sees the page exactly as it was.
 */
export function RecentlyViewedListings({
  currentListingId,
}: {
  /** The listing whose page this is. Absent on the browse page. */
  currentListingId?: string
}) {
  // Tagged with the page they were read for, so moving from one listing to
  // another through this row never leaves the last page's cards up.
  const [row, setRow] = React.useState<{
    forListing: string | undefined
    cards: PublicListingCard[]
  }>({ forListing: undefined, cards: [] })

  React.useEffect(() => {
    const ids = readRecentlyViewed().filter((id) => id !== currentListingId)
    if (currentListingId) rememberViewed(currentListingId)
    if (ids.length === 0) return

    let current = true
    loadRecentlyViewed(ids)
      .then((fresh) => {
        if (current) {
          setRow({
            forListing: currentListingId,
            cards: fresh.slice(0, RECENTLY_VIEWED_SHOWN),
          })
        }
      })
      // The row is an extra. A failed read leaves it out rather than putting
      // an error at the foot of a page that loaded fine.
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [currentListingId])

  const cards = row.forListing === currentListingId ? row.cards : []
  if (cards.length === 0) return null

  return (
    <section className="grid gap-2 md:gap-3" aria-labelledby="recently-viewed">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="recently-viewed"
          className="text-lg font-semibold tracking-tight"
        >
          Recently viewed
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            clearRecentlyViewed()
            setRow({ forListing: currentListingId, cards: [] })
          }}
        >
          Clear
        </Button>
      </div>
      <ListingGrid listings={cards} emptyMessage="" />
    </section>
  )
}
