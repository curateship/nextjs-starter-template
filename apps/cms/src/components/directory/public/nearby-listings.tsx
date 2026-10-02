import { Link } from "@tanstack/react-router"
import { MapPinIcon } from "lucide-react"

import { ClaimedBadge } from "@/components/directory/public/claimed-badge"
import { FeaturedBadge } from "@/components/directory/public/featured-badge"
import { ListingRating } from "@/components/directory/listing-rating"
import { Card, CardContent } from "@/components/ui/card"
import type { PublicListingCard } from "@/lib/api/directory/public"
import { formatDirectoryDistance } from "@/lib/directory/public-search"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * "Also nearby": the other places under a listing, as rows rather than cards.
 *
 * A row fits the photo, the name, a sentence, the stars, the address and the
 * neighbourhood on one line each, which is what somebody comparing five
 * restaurants wants. The grid of cards stays where it belongs, on the browse
 * page and the category pages, where the visitor is looking rather than
 * comparing.
 *
 * A place the server found by distance carries a `distanceKm` and prints it.
 * One found by neighbourhood does not, and prints nothing in its place. The
 * heading is the same either way, so the visitor is never shown which of the
 * two filled the row.
 */
export function NearbyListings({
  listings,
}: {
  listings: PublicListingCard[]
}) {
  if (!listings.length) return null

  return (
    <Card>
      <CardContent className="grid gap-3">
        <h2 className="text-lg font-semibold">Also nearby</h2>
      </CardContent>
      <ul className="divide-y border-t">
        {listings.map((listing) => {
          const distance = formatDirectoryDistance(listing.distanceKm)
          return (
            <li
              key={listing.id}
              className="relative flex gap-3 px-4 py-3 transition-colors hover:bg-accent/40 md:gap-4"
            >
              {/* The box is drawn whether or not there is a photo, so the names
                down the list start at the same place. A listing with none gets
                a plain muted square rather than the row jumping left. */}
              <div className="size-20 shrink-0 overflow-hidden rounded-md bg-muted md:size-28">
                {listing.featuredImage ? (
                  <img
                    src={listing.featuredImage}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : null}
              </div>
              <div className="grid min-w-0 flex-1 content-start gap-1">
                {listing.featured ? (
                  <div>
                    <FeaturedBadge />
                  </div>
                ) : null}
                <h3 className="text-base leading-snug font-semibold">
                  {/*
                   * The whole row is the link: a row where only the name can be
                   * clicked reads as broken to anybody who aims at the photo.
                   * The ring stays on the name, which is where the words are.
                   */}
                  <Link
                    to="/directory/$slug"
                    params={{ slug: listing.slug }}
                    search={{}}
                    className={`after:absolute after:inset-0 ${focusRing}`}
                  >
                    {listing.title}
                  </Link>
                </h3>
                {listing.metaDescription ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {listing.metaDescription}
                  </p>
                ) : null}
                {/* `min-w-0` or the truncating address refuses to shrink: a
                  flex item's default minimum is its content, so the row grew
                  past the card on a phone and the address was cut off by the
                  card's edge instead of by its own ellipsis. */}
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <ListingRating rating={listing.rating} />
                  {/* Only a place found by distance has one to print. The
                    neighbourhood top-up has none. */}
                  {distance ? <span>{distance}</span> : null}
                  {listing.address ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <MapPinIcon
                        className="size-3.5 shrink-0 text-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 truncate">
                        {listing.address}
                      </span>
                    </span>
                  ) : null}
                  {listing.neighbourhood ? (
                    <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-xs">
                      {listing.neighbourhood.name}
                    </span>
                  ) : null}
                  {/* Above the row-wide click target, so the mark's own tooltip
                    is reachable rather than covered by it. */}
                  {listing.claimed ? (
                    <span className="relative z-10">
                      <ClaimedBadge size="small" />
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
