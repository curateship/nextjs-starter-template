import { Link } from "@tanstack/react-router"

import { CategoryGrid } from "@/components/directory/public/category-grid"
import { ListingGrid } from "@/components/directory/public/listing-grid"
import { ListingMap } from "@/components/directory/public/listing-map"
import { EventCardGrid } from "@/components/events/public/event-card"
import { PostGrid } from "@/components/posts/public/post-grid"
import { DealGrid } from "@/components/promotions/public/deal-grid"
import { Button } from "@/components/ui/button"
import type { AppFrontPageRowProps } from "@/lib/app-options"
import type {
  CategoriesRowData,
  DealsRowData,
  EventsRowData,
  ListingsRowData,
  PostsRowData,
} from "@/lib/directory/front-page-row-data"

/**
 * What CMS's own front page rows draw, inside the shell's row.
 *
 * The heading, the line under it, the alignment and the Visibility switches all
 * belong to the shell's row around this, so each of these is only the content:
 * the cards, and the button that leads to the whole list.
 *
 * Everything drawn here was read on the server by the matching reader in
 * `src/server/directory/front-page-row-readers.ts`. A row whose reader found
 * nothing never reaches this file — the shell leaves it off the page.
 */

/** A row whose reader answered nothing draws nothing, rather than an empty grid. */
function noData(data: unknown): data is null | undefined {
  return data === null || data === undefined
}

export function ListingsRowContent({ data }: AppFrontPageRowProps) {
  if (noData(data)) return null
  const row = data as ListingsRowData

  // A map row's listings always carry both numbers — the reader refuses one
  // that does not — but the pins are counted rather than assumed, because the
  // map's "showing 12 of 40" line compares the two and a home page row has
  // nothing to narrow down.
  const pins =
    row.layout === "map"
      ? row.listings.flatMap((listing) =>
          listing.latitude === undefined || listing.longitude === undefined
            ? []
            : [
                {
                  ...listing,
                  latitude: listing.latitude,
                  longitude: listing.longitude,
                },
              ]
        )
      : []

  return (
    <div className="grid w-full gap-2 md:gap-3">
      {row.layout === "map" && row.mapApiKey ? (
        <ListingMap apiKey={row.mapApiKey} pins={pins} total={pins.length} />
      ) : (
        <ListingGrid
          listings={row.listings}
          layout={row.layout === "list" ? "list" : "grid"}
          // Never seen: a row with no listings is left off the page.
          emptyMessage="There are no listings to show yet."
        />
      )}
      <div>
        <Button asChild variant="outline">
          <Link to="/directory" search={row.browse} preload="intent">
            See them all
          </Link>
        </Button>
      </div>
    </div>
  )
}

export function CategoriesRowContent({ data }: AppFrontPageRowProps) {
  if (noData(data)) return null
  const row = data as CategoriesRowData

  // No "see them all" under a row of categories: every card is already a way
  // in, and the button below a row of listings exists because a row shows a
  // handful of many.
  return (
    <div className="w-full">
      <CategoryGrid categories={row.cards} />
    </div>
  )
}

export function EventsRowContent({ data }: AppFrontPageRowProps) {
  if (noData(data)) return null
  const row = data as EventsRowData

  return (
    <div className="grid w-full gap-2 md:gap-3">
      <p className="text-sm text-muted-foreground">All times are {row.zone}.</p>
      <EventCardGrid
        // Only events still to come reach a row, so none is marked over.
        events={row.events.map((event) => ({ ...event, ended: false }))}
        emptyMessage="Nothing is coming up yet."
      />
      <div>
        <Button asChild variant="outline">
          <Link
            to="/events"
            search={row.categorySlug ? { category: row.categorySlug } : {}}
            preload="intent"
          >
            See all events
          </Link>
        </Button>
      </div>
    </div>
  )
}

export function DealsRowContent({ data }: AppFrontPageRowProps) {
  if (noData(data)) return null
  const row = data as DealsRowData

  return (
    <div className="grid w-full gap-2 md:gap-3">
      <DealGrid deals={row.deals} />
      <div>
        <Button asChild variant="outline">
          <Link
            to="/deals"
            search={row.categorySlug ? { category: row.categorySlug } : {}}
            preload="intent"
          >
            See all deals
          </Link>
        </Button>
      </div>
    </div>
  )
}

export function PostsRowContent({ data }: AppFrontPageRowProps) {
  if (noData(data)) return null
  const row = data as PostsRowData

  return (
    <div className="grid w-full gap-2 md:gap-3">
      <PostGrid
        posts={row.posts}
        siteName={row.siteName}
        emptyMessage="Nothing has been posted yet."
      />
      <div>
        <Button asChild variant="outline">
          <Link to="/posts" preload="intent">
            See all posts
          </Link>
        </Button>
      </div>
    </div>
  )
}
