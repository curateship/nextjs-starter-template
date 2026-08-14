import { Link } from "@tanstack/react-router"

import { ClaimedBadge } from "@/components/directory/public/claimed-badge"
import { FeaturedBadge } from "@/components/directory/public/featured-badge"
import { SaveDropdown } from "@/components/directory/public/save-dropdown"
import { ListingRating } from "@/components/directory/listing-rating"
import { Card, CardContent } from "@/components/ui/card"
import type { PublicListingCard } from "@/lib/api/directory/public"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * The card grid every public directory list uses: browse, a category page, and
 * the related listings under a listing. One component so all three read the
 * same, rather than three grids that slowly stop matching.
 */
export function ListingGrid({
  listings,
  emptyMessage,
}: {
  listings: PublicListingCard[]
  emptyMessage: string
}) {
  if (listings.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3">
      {listings.map((listing) => (
        <li key={listing.id} className="flex">
          <ListingCard listing={listing} />
        </li>
      ))}
    </ul>
  )
}

function ListingCard({ listing }: { listing: PublicListingCard }) {
  return (
    <Card className="group/card relative w-full transition-colors hover:bg-accent/40">
      {listing.featuredImage ? (
        <div className="relative overflow-hidden">
          <img
            src={listing.featuredImage}
            alt=""
            loading="lazy"
            className="aspect-[3/2] w-full object-cover transition-opacity duration-200 group-hover/card:opacity-75"
          />
          <SaveDropdown
            listingId={listing.id}
            overlay
            className="absolute top-2 right-2 transition-opacity md:opacity-0 md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100"
          />
        </div>
      ) : (
        <SaveDropdown
          listingId={listing.id}
          className="absolute top-2 right-2 transition-opacity md:opacity-0 md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100"
        />
      )}
      <CardContent className="grid gap-1">
        {listing.featured ? <FeaturedBadge /> : null}
        <h2 className="text-base leading-snug font-medium">
          {/*
           * The whole card is the link rather than the title alone: a card
           * where only four words are clickable reads as broken to anybody
           * who aims at the picture. `after:absolute` stretches an invisible
           * layer over the card, so the click target grows without anything
           * being nested inside the link.
           *
           * The ring stays on the title, which is where the words are — the
           * stretched layer has no size of its own to draw one around.
           */}
          <Link
            to="/directory/$slug"
            params={{ slug: listing.slug }}
            search={{}}
            className={`after:absolute after:inset-0 ${focusRing}`}
          >
            {listing.title}
          </Link>
        </h2>
        <ListingRating rating={listing.rating} />
        {listing.category || listing.claimed ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {listing.category ? listing.category.name : null}
            {/* Above the stretched link layer, so the badge's own tooltip is
                reachable rather than being covered by the card-wide click
                target. */}
            {listing.claimed ? (
              <span className="relative z-10">
                <ClaimedBadge size="small" />
              </span>
            ) : null}
          </p>
        ) : null}
        {listing.metaDescription ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {listing.metaDescription}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
