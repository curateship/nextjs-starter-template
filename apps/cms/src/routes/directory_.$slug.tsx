import { createFileRoute, notFound } from "@tanstack/react-router"

import {
  DirectoryBreadcrumbs,
  type Crumb,
} from "@/components/directory/public/directory-breadcrumbs"
import { ClaimButton } from "@/components/directory/public/claim-button"
import { FeaturedBadge } from "@/components/directory/public/featured-badge"
import { SaveDropdown } from "@/components/directory/public/save-dropdown"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { JsonLd } from "@/components/directory/public/json-ld"
import { ListingContactLinks } from "@/components/directory/public/listing-contact-links"
import { ListingGrid } from "@/components/directory/public/listing-grid"
import { ListingRating } from "@/components/directory/listing-rating"
import {
  ListingGallery,
  ListingHoursAndLocation,
} from "@/components/directory/public/listing-rich-details"
import { WrittenPageBody } from "@/components/pages/written-page-body"
import { Card, CardContent } from "@/components/ui/card"
import { loadDirectoryListing } from "@/lib/api/directory/public"
import { requirePageVisible } from "@/lib/api/content/pages"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
  listingJsonLd,
  listingPageShareImage,
} from "@/lib/directory/public-seo"

/**
 * One listing's page: one fixed layout, not a block renderer.
 *
 * That is deliberate and it is why this file is short. A listing here is a
 * plain record — picture, title, categories, links, one written body — so
 * there is nothing to arrange and no template to inherit from. The directory
 * app this is ported from has a block system; that layer was cut on purpose,
 * and a listing that needs more gets a column rather than a block.
 *
 * The address is `/directory/<slug>`, and the underscore in this file's name
 * keeps it out from under the browse page — otherwise the browse route would
 * have to render this one inside itself.
 *
 * Three misses look identical from out here — no such address, a draft, and
 * another site's listing — because the endpoint answers null to all three. A
 * visitor is told the same thing in each case, which is the point: a draft
 * must not be distinguishable from a page that was never written.
 */
type ListingSearch = { claim?: "start" }

export const Route = createFileRoute("/directory_/$slug")({
  validateSearch: (search: Record<string, unknown>): ListingSearch =>
    search.claim === "start" ? { claim: "start" } : {},
  loader: async ({ params }) => {
    // A listing page follows the directory's own switch. Hiding the directory
    // and leaving every listing inside it readable would be the switch not
    // working.
    const [, page] = await Promise.all([
      requirePageVisible("/directory"),
      loadDirectoryListing(params.slug),
    ])

    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return directoryHead(
      directoryTitle(loaderData.listing.title, loaderData.site.name),
      directoryDescription(
        loaderData.listing.metaDescription,
        `${loaderData.listing.title} on ${loaderData.site.name}.`
      ),
      listingPageShareImage({
        featuredImage: loaderData.listing.featuredImage,
        siteUrl: loaderData.site.url,
        slug: loaderData.listing.slug,
        version: loaderData.shareImageVersion,
      })
    )
  },
  component: ListingRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function ListingRoute() {
  const { site, listing, categories, primaryCategory, related, claim } =
    Route.useLoaderData()
  const search = Route.useSearch()

  const crumbs: Crumb[] = [
    { label: site.name, home: true },
    { label: "Directory" },
    ...(primaryCategory
      ? [{ label: primaryCategory.name, categorySlug: primaryCategory.slug }]
      : []),
    { label: listing.title },
  ]

  return (
    <DirectoryFrame>
      <JsonLd
        data={listingJsonLd({
          siteName: site.name,
          siteUrl: site.url,
          title: listing.title,
          slug: listing.slug,
          description: listing.metaDescription,
          image: listing.featuredImage,
          gallery: listing.gallery,
          hours: listing.hours,
          address: listing.contactLinks.address,
          latitude: listing.latitude,
          longitude: listing.longitude,
          createdAt: listing.createdAt,
          updatedAt: listing.updatedAt,
        })}
      />

      <DirectoryBreadcrumbs crumbs={crumbs} />

      <Card>
        {listing.featuredImage ? (
          <div className="relative overflow-hidden">
            <img
              src={listing.featuredImage}
              alt=""
              className="aspect-[3/1] w-full object-cover"
            />
            <SaveDropdown
              listingId={listing.id}
              overlay
              className="absolute top-3 right-3"
            />
          </div>
        ) : null}
        <ListingGallery title={listing.title} images={listing.gallery} />
        <CardContent className="grid gap-4">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold">{listing.title}</h1>
                {listing.featured ? <FeaturedBadge /> : null}
              </div>
              {!listing.featuredImage ? (
                <SaveDropdown listingId={listing.id} />
              ) : null}
            </div>
            <ListingRating rating={listing.rating} />
            {listing.metaDescription ? (
              <p className="text-sm text-muted-foreground">
                {listing.metaDescription}
              </p>
            ) : null}
          </div>

          {categories.length ? (
            <p className="text-xs text-muted-foreground">
              {categories.map((category) => category.name).join(" · ")}
            </p>
          ) : null}

          <ListingContactLinks links={listing.contactLinks} />

          <ListingHoursAndLocation
            hours={listing.hours}
            coordinates={
              listing.latitude !== null && listing.longitude !== null
                ? {
                    latitude: listing.latitude,
                    longitude: listing.longitude,
                  }
                : null
            }
          />

          {/* Between the facts and the story: somebody deciding whether this is
              their business has read enough by here, and it stays above the
              body rather than at the bottom of a long page.

              Wrapped, because this card is a grid — a button left as a direct
              child of it stretches the full width of the page, which reads as
              a banner rather than a thing to press. */}
          <div>
            <ClaimButton
              listingId={listing.id}
              listingSlug={listing.slug}
              listingTitle={listing.title}
              claim={claim}
              startOpen={search.claim === "start"}
            />
          </div>

          {/*
           * The same renderer the shell's written pages use. It builds React
           * elements from the stored nodes and never a string of markup, so
           * nothing an admin typed can be anything but the text of a
           * paragraph.
           */}
          <WrittenPageBody body={listing.body} />
        </CardContent>
      </Card>

      {related.length ? (
        <section className="grid gap-2 md:gap-3">
          <h2 className="text-lg font-semibold">More like this</h2>
          <ListingGrid
            listings={related}
            emptyMessage="Nothing else shares a category with this one."
          />
        </section>
      ) : null}
    </DirectoryFrame>
  )
}
