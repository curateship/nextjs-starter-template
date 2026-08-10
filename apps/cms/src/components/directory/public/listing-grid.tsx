import { Link } from "@tanstack/react-router"

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
    <Card className="relative w-full transition-colors hover:bg-accent/40">
      {listing.featuredImage ? (
        <img
          src={listing.featuredImage}
          alt=""
          loading="lazy"
          className="aspect-[3/2] w-full object-cover"
        />
      ) : null}
      <CardContent className="grid gap-1">
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
            className={`after:absolute after:inset-0 ${focusRing}`}
          >
            {listing.title}
          </Link>
        </h2>
        {listing.category ? (
          <p className="text-xs text-muted-foreground">
            {listing.category.name}
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
