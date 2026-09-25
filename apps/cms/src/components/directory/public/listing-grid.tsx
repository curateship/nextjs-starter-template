import { Link } from "@tanstack/react-router"
import { MapPinIcon, StarIcon, TagIcon } from "lucide-react"

import { ClaimedBadge } from "@/components/directory/public/claimed-badge"
import { FeaturedBadge } from "@/components/directory/public/featured-badge"
import { SaveDropdown } from "@/components/directory/public/save-dropdown"
import { CategoryPill } from "@/components/shared/card-chips"
import { ListingRating } from "@/components/directory/listing-rating"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import type { PublicListingCard } from "@/lib/api/directory/public"
import { publicCardHover } from "@/lib/layout/card-hover"
import { focusRing } from "@/lib/layout/focus-ring"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { formatDirectoryDistance } from "@/lib/directory/public-search"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"
import { cn } from "@/lib/utils"

/**
 * The card grid every public directory list uses: browse, a category page, and
 * the related listings under a listing. One component so all three read the
 * same, rather than three grids that slowly stop matching.
 */
export function ListingGrid({
  listings,
  emptyMessage,
  layout = "grid",
}: {
  listings: PublicListingCard[]
  emptyMessage: string
  /**
   * `list` is one card per line all the way up. It exists because a home page
   * row of three listings reads better stacked than as a third of a grid, and
   * it is the same card either way rather than a second one to keep in step.
   */
  layout?: "grid" | "list"
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
    <ul
      className={
        layout === "list" ? "grid" : "grid sm:grid-cols-2 lg:grid-cols-3"
      }
      // The space between cards is the site's own gutter from Settings →
      // Styling, the same value `CardGroup` puts between stacked cards. A fixed
      // gap here would ignore a site that widened or tightened its spacing.
      style={{ gap: pageGutter }}
    >
      {listings.map((listing) => (
        // No `flex` on the row item, so a card is as tall as what is in it.
        // Stretching every card to the tallest in its row puts a band of empty
        // white between the description and the dividing line, and the design
        // lets the bottoms sit where they fall.
        <li key={listing.id}>
          <ListingCard listing={listing} />
        </li>
      ))}
    </ul>
  )
}

/**
 * The rating over the top-right of the photo. The stars themselves stay under
 * the title, so this chip is decoration over a picture and is hidden from a
 * screen reader rather than read out twice.
 */
function RatingChip({ rating }: { rating: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-xs font-medium text-background"
    >
      <StarIcon className="size-3 fill-current" />
      {rating}
    </span>
  )
}

/**
 * Exported so the map's pin card is this card, not a second half-copy of it.
 * A pin that opened a card missing the rating or the claimed tick would be one
 * more thing to keep in step by hand.
 */
export function ListingCard({ listing }: { listing: PublicListingCard }) {
  const distance =
    listing.distanceKm === undefined
      ? null
      : formatDirectoryDistance(listing.distanceKm) ||
        "Map location unavailable"
  // The category rides on the photo. A listing with no photo has nowhere to put
  // it, so it falls back to the row of tags above the title rather than
  // vanishing.
  const categoryInBadges = !listing.featuredImage && listing.category
  const hasBadges =
    listing.featured ||
    listing.dealHeadline ||
    listing.claimed ||
    categoryInBadges
  // A footer only when there is something to put in it. Its background is
  // cleared where it is drawn, because here the footer is a dividing line, not
  // the shaded strip the shared one draws at the foot of a dashboard card.
  const hasFooter = Boolean(
    listing.address || distance || listing.neighbourhood
  )

  return (
    <Card
      className={cn(
        `relative w-full ${publicCardHover}`,
        // The card only drops its top padding for a bare `<img>` first child,
        // and the overlays need a box to sit in, so the photo says so itself.
        listing.featuredImage && "pt-0"
      )}
    >
      {listing.featuredImage ? (
        <div className="relative overflow-hidden">
          <img
            src={listing.featuredImage}
            srcSet={mediaImageSrcSet(listing.featuredImage)}
            sizes="(min-width: 640px) 50vw, 100vw"
            alt=""
            loading="lazy"
            className="aspect-[3/2] w-full object-cover"
          />
          {/* The photo fades into the card at its bottom edge rather than
              stopping at a hard line. `from-card` rather than white, so the
              fade is the card's own colour in dark mode too. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent"
          />
          {/* One row across the top so a long category name is cut short by the
              rating rather than running under it. */}
          {listing.category || listing.rating !== null ? (
            <div
              className={cn(
                // Inset by the card's own content padding, so the pill's left
                // edge lines up with the name under it and the rating's right
                // edge lines up with the end of the address.
                "absolute inset-x-4 top-4 flex items-start gap-2",
                listing.category ? "justify-between" : "justify-end"
              )}
            >
              {listing.category ? (
                <CategoryPill name={listing.category.name} />
              ) : null}
              {listing.rating === null ? null : (
                <RatingChip rating={listing.rating} />
              )}
            </div>
          ) : null}
          {/* Bottom right, because the rating chip owns the top right. Not
              `overlay`: that draws the bookmark white for a photo behind it,
              and down here the photo has already faded into the card, so a
              white bookmark would be white on white. */}
          <SaveDropdown
            listingId={listing.id}
            className="absolute right-4 bottom-4 transition-opacity md:opacity-0 md:group-focus-within/card:opacity-100 md:group-hover/card:opacity-100"
          />
        </div>
      ) : (
        <SaveDropdown
          listingId={listing.id}
          className="absolute top-4 right-4 transition-opacity md:opacity-0 md:group-focus-within/card:opacity-100 md:group-hover/card:opacity-100"
        />
      )}
      <CardContent className="grid gap-1">
        {hasBadges ? (
          <div className="flex flex-wrap items-center gap-1">
            {listing.featured ? <FeaturedBadge /> : null}
            {listing.dealHeadline ? (
              <Badge variant="secondary" className="max-w-full">
                <TagIcon aria-hidden="true" />
                <span className="sr-only">Deal: </span>
                <span className="truncate">{listing.dealHeadline}</span>
              </Badge>
            ) : null}
            {categoryInBadges ? (
              <CategoryPill name={categoryInBadges.name} tone="plain" />
            ) : null}
            {/* Above the stretched link layer, so the badge's own tooltip is
                reachable rather than being covered by the card-wide click
                target. */}
            {listing.claimed ? (
              <span className="relative z-10">
                <ClaimedBadge size="small" />
              </span>
            ) : null}
          </div>
        ) : null}
        <h2 className="text-lg leading-snug font-semibold">
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
        {listing.metaDescription ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {listing.metaDescription}
          </p>
        ) : null}
      </CardContent>
      {hasFooter ? (
        <CardFooter className="flex-col items-start gap-2 bg-transparent">
          {listing.address ? (
            <p className="flex w-full items-start gap-1.5 text-sm">
              <MapPinIcon
                className="mt-0.5 size-3.5 shrink-0"
                aria-hidden="true"
              />
              <span className="min-w-0">{listing.address}</span>
            </p>
          ) : null}
          {distance ? (
            <p className="text-xs text-muted-foreground">{distance}</p>
          ) : null}
          {listing.neighbourhood ? (
            <span className="max-w-full truncate rounded-full bg-foreground/5 px-2.5 py-1 text-xs text-muted-foreground">
              {listing.neighbourhood.name}
            </span>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  )
}
