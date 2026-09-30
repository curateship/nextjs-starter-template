import { CategoryGrid } from "@/components/directory/public/category-grid"
import { ListingGrid } from "@/components/directory/public/listing-grid"
import { ListingMap } from "@/components/directory/public/listing-map"
import { EventCardGrid } from "@/components/events/public/event-card"
import { PostGrid } from "@/components/posts/public/post-grid"
import { DealGrid } from "@/components/promotions/public/deal-grid"
import type { AppFrontPageRowProps } from "@/lib/app-options"
import {
  cleanListingsRowSettings,
  cleanPickedRowSettings,
} from "@/lib/directory/front-page-kinds"
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

export function ListingsRowContent({ data, settings }: AppFrontPageRowProps) {
  if (noData(data)) return null
  const row = data as ListingsRowData
  const { columns } = cleanListingsRowSettings(settings)

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

  // The way to the whole list is the button beside the heading, drawn by the
  // shell from what the reader filled this row with.
  return row.layout === "map" && row.mapApiKey ? (
    <ListingMap apiKey={row.mapApiKey} pins={pins} total={pins.length} />
  ) : (
    <ListingGrid
      listings={row.listings}
      layout={row.layout === "list" ? "list" : "grid"}
      columns={columns}
      // Never seen: a row with no listings is left off the page.
      emptyMessage="There are no listings to show yet."
    />
  )
}

export function CategoriesRowContent({ data }: AppFrontPageRowProps) {
  if (noData(data)) return null
  const row = data as CategoriesRowData

  // No "see them all" under a row of categories: every card is already a way
  // in, and the button below a row of listings exists because a row shows a
  // handful of many.
  return <CategoryGrid categories={row.cards} />
}

export function EventsRowContent({ data, settings }: AppFrontPageRowProps) {
  if (noData(data)) return null
  const row = data as EventsRowData
  const { columns } = cleanPickedRowSettings(settings)

  return (
    <div className="grid w-full gap-2 md:gap-3">
      <p className="text-sm text-muted-foreground">All times are {row.zone}.</p>
      <EventCardGrid
        // Only events still to come reach a row, so none is marked over.
        events={row.events.map((event) => ({ ...event, ended: false }))}
        emptyMessage="Nothing is coming up yet."
        columns={columns}
      />
    </div>
  )
}

export function DealsRowContent({ data, settings }: AppFrontPageRowProps) {
  if (noData(data)) return null
  const row = data as DealsRowData
  const { columns } = cleanPickedRowSettings(settings)

  return <DealGrid deals={row.deals} columns={columns} />
}

export function PostsRowContent({ data, settings }: AppFrontPageRowProps) {
  if (noData(data)) return null
  const row = data as PostsRowData
  const { columns } = cleanPickedRowSettings(settings)

  return (
    <PostGrid
      posts={row.posts}
      siteName={row.siteName}
      emptyMessage="Nothing has been posted yet."
      columns={columns}
    />
  )
}
