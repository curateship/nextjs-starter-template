import { NavigationIcon } from "lucide-react"

import { ClaimButton } from "@/components/directory/public/claim-button"
import {
  LISTING_ROW_CLASS,
  ListingContactLinks,
  ListingSocialLinks,
} from "@/components/directory/public/listing-contact-links"
import { ReportProblemButton } from "@/components/directory/public/report-problem-button"
import { ListingRating } from "@/components/directory/listing-rating"
import { SaveDropdown } from "@/components/directory/public/save-dropdown"
import { RatingChip } from "@/components/shared/card-chips"
import { Card, CardContent } from "@/components/ui/card"
import {
  googleMapsDirectionsUrl,
  type ListingCoordinates,
} from "@/lib/directory/listing-details"
import { focusRing } from "@/lib/layout/focus-ring"
import type { ContactLinks } from "@/lib/directory/contact-links"
import type { PublicClaimState } from "@/lib/api/directory/public"

/**
 * The card beside a listing: its photo, its rating, and every way to reach it,
 * one line each.
 *
 * The name and the Featured badge are in the band at the top of the page rather
 * than on this card, from 27 Sep 2026: Tyler asked for a listing to open the
 * way the directory and a category do, and printing the name here as well would
 * be the same words twice on one screen. The card carried the page's `h1` until
 * then.
 *
 * The rating is the chip over the photo, where a listing card in the directory
 * puts it. A card with no photo has nowhere to hang it and shows the stars on
 * its top line instead — one copy either way.
 */
export function ListingSidebar({
  listing,
  coordinates,
  claim,
  startClaimOpen,
}: {
  listing: {
    id: string
    title: string
    slug: string
    featuredImage: string
    rating: number | null
    featured: boolean
    contactLinks: ContactLinks
  }
  /**
   * The pin, when the listing has one. It only draws a row of its own when the
   * listing carries no directions link already — two "Get directions" lines on
   * one card is the same answer twice.
   */
  coordinates: ListingCoordinates | null
  claim: PublicClaimState
  startClaimOpen: boolean
}) {
  const hasDirectionsLink = listing.contactLinks.menuLinks.some(
    (link) => link.type === "directions" && link.value.trim()
  )

  return (
    <Card
      // No top padding above a photo: the card only drops it for a bare `<img>`
      // first child, and the overlays on the photo need a box to sit in, so the
      // photo says so itself. Without this there was a strip of card above it.
      className={listing.featuredImage ? "pt-0" : undefined}
    >
      {listing.featuredImage ? (
        <div className="relative overflow-hidden">
          <img
            src={listing.featuredImage}
            alt=""
            className="aspect-[4/3] w-full object-cover"
          />
          {/* The rating over the photo, on the left, the way a listing card in
              the directory draws it. The stars were under the name in the band
              above until 27 Sep 2026; the chip says the same thing where the
              eye already is. */}
          {listing.rating === null ? null : (
            <RatingChip
              rating={listing.rating}
              className="absolute top-3 left-3"
            />
          )}
          <SaveDropdown
            listingId={listing.id}
            overlay
            className="absolute top-3 right-3"
          />
          <ListingSocialLinks
            links={listing.contactLinks}
            className="absolute right-3 bottom-3 flex flex-wrap items-center justify-end gap-2"
          />
        </div>
      ) : null}

      {/* A card with no photo has nowhere to hang the rating chip, the save
          button or the social links, so they get a line of their own at the
          top. A card with one draws all three over the photo. */}
      {listing.featuredImage ? null : (
        <CardContent className="flex flex-wrap items-center gap-2">
          <ListingRating rating={listing.rating} />
          <ListingSocialLinks
            links={listing.contactLinks}
            className="flex flex-wrap items-center gap-2"
          />
          {/* `ml-auto` rather than the row's own spacing: a listing with no
              social links leaves the button alone on the line, and it belongs
              at the end of it either way. */}
          <SaveDropdown listingId={listing.id} className="ml-auto" />
        </CardContent>
      )}

      {/* Full-bleed rows: each one highlights across the whole card when the
          pointer is over it, so the padding lives on the row and not here. */}
      <div className="grid">
        <ListingContactLinks links={listing.contactLinks} />
        {coordinates && !hasDirectionsLink ? (
          <a
            href={googleMapsDirectionsUrl(coordinates)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={`${LISTING_ROW_CLASS} hover:bg-accent/40 ${focusRing}`}
          >
            <NavigationIcon className="size-4 shrink-0" aria-hidden="true" />
            Get directions
          </a>
        ) : null}
        <ClaimButton
          asRow
          listingId={listing.id}
          listingSlug={listing.slug}
          listingTitle={listing.title}
          claim={claim}
          startOpen={startClaimOpen}
        />
        {/* Last line of the card. Somebody who has just read the hours and
            knows they are wrong is looking here, not at the foot of the
            page. */}
        <ReportProblemButton
          asRow
          kind="listing"
          subjectId={listing.id}
          title={listing.title}
        />
      </div>
    </Card>
  )
}
