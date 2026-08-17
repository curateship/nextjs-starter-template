import { Link } from "@tanstack/react-router"

import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { ListingGrid } from "@/components/directory/public/listing-grid"
import { ListingMap } from "@/components/directory/public/listing-map"
import { Button } from "@/components/ui/button"
import type {
  DirectoryFrontPageData,
  DirectoryFrontPageRow,
} from "@/lib/directory/front-page"

/**
 * A site's home page: its own title, then the rows of listings it chose.
 *
 * Every row here has something in it — a row whose filter matched nothing is
 * dropped on the server, so there is no heading over an empty space and no
 * "there are no listings yet" inside a row somebody deliberately configured.
 *
 * A page with no rows at all never reaches this component: the loader answers
 * "not mine" and the platform's own front page draws instead.
 */
export function DirectoryFrontPage({ data }: { data: DirectoryFrontPageData }) {
  return (
    <DirectoryFrame>
      <section className="grid gap-4 md:gap-6" aria-labelledby="front-page-title">
        <div className="grid gap-2">
          <h1
            id="front-page-title"
            className="text-2xl font-semibold tracking-tight"
          >
            {data.heading}
          </h1>
          {data.intro ? (
            <p className="max-w-3xl text-sm text-muted-foreground">
              {data.intro}
            </p>
          ) : null}
        </div>

        {data.rows.map((row) => (
          <FrontPageRow key={row.id} row={row} mapApiKey={data.mapApiKey} />
        ))}
      </section>
    </DirectoryFrame>
  )
}

function FrontPageRow({
  row,
  mapApiKey,
}: {
  row: DirectoryFrontPageRow
  mapApiKey: string | null
}) {
  const headingId = `front-page-row-${row.id}`
  // A map row's listings always carry both numbers — the server refuses one
  // that does not — but the pins are counted rather than assumed. The map's
  // "showing 12 of 40" line compares these two, and on a home page row there is
  // nothing to narrow down, so the two must never differ.
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
    <section className="grid gap-2 md:gap-3" aria-labelledby={headingId}>
      <div className="grid gap-1">
        <h2 id={headingId} className="text-lg font-semibold tracking-tight">
          {row.heading}
        </h2>
        {row.intro ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{row.intro}</p>
        ) : null}
      </div>

      {row.layout === "map" && mapApiKey ? (
        // The row's own limit is the only cap here, and it is the number the
        // site chose, so `total` matching the pin count is what says "nothing
        // is missing" and keeps the map's cap line off a home page.
        <ListingMap apiKey={mapApiKey} pins={pins} total={pins.length} />
      ) : (
        <ListingGrid
          listings={row.listings}
          layout={row.layout === "list" ? "list" : "grid"}
          // Never seen: an empty row is dropped on the server. Said anyway
          // because the grid asks for it.
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
    </section>
  )
}
