import { NavigationIcon } from "lucide-react"

import { ClaimButton } from "@/components/directory/public/claim-button"
import { FeaturedBadge } from "@/components/directory/public/featured-badge"
import {
  LISTING_ROW_CLASS,
  ListingContactLinks,
  ListingSocialLinks,
} from "@/components/directory/public/listing-contact-links"
import { ReportProblemButton } from "@/components/directory/public/report-problem-button"
import { SaveDropdown } from "@/components/directory/public/save-dropdown"
import { ListingRating } from "@/components/directory/listing-rating"
import { Card, CardContent } from "@/components/ui/card"
import {
  googleMapsDirectionsUrl,
  type ListingCoordinates,
} from "@/lib/directory/listing-details"
import { focusRing } from "@/lib/layout/focus-ring"
import type { ContactLinks } from "@/lib/directory/contact-links"
import type { PublicClaimState } from "@/lib/api/directory/public"

/**
 * The card beside a listing: its photo, its name, its stars, and every way to
 * reach it, one line each.
 *
 * It carries the page's `h1`. The name belongs next to the photo and the phone
 * number rather than over the write-up, which is what the old Eat Drink Toronto
 * page does and what somebody deciding whether to go there reads first.
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
    <Card>
      {listing.featuredImage ? (
        <div className="relative overflow-hidden">
          <img
            src={listing.featuredImage}
            alt=""
            className="aspect-[4/3] w-full object-cover"
          />
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

      <CardContent className="grid gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-2">
            {listing.featured ? (
              <div>
                <FeaturedBadge />
              </div>
            ) : null}
            <h1 className="text-2xl font-semibold">{listing.title}</h1>
            <ListingRating rating={listing.rating} />
          </div>
          {listing.featuredImage ? null : (
            <SaveDropdown listingId={listing.id} />
          )}
        </div>
        {listing.featuredImage ? null : (
          <ListingSocialLinks
            links={listing.contactLinks}
            className="flex flex-wrap items-center gap-2"
          />
        )}
      </CardContent>

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
          listingId={listing.id}
          listingTitle={listing.title}
        />
      </div>
    </Card>
  )
}
