import { createFileRoute, notFound } from "@tanstack/react-router"

import {
  DirectoryBreadcrumbs,
  type Crumb,
} from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { JsonLd } from "@/components/directory/public/json-ld"
import { ListingCustomSections } from "@/components/directory/public/listing-custom-sections"
import { ListingEventsBox } from "@/components/directory/public/listing-events"
import { ListingSidebar } from "@/components/directory/public/listing-sidebar"
import { RelatedListings } from "@/components/directory/public/related-listings"
import {
  ListingGallery,
  ListingHoursCard,
} from "@/components/directory/public/listing-rich-details"
import { WrittenPageBody } from "@/components/pages/written-page-body"
import { writtenPageBodyIsEmpty } from "@/lib/pages/written-page-body"
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
  const {
    site,
    listing,
    categories,
    primaryCategory,
    related,
    claim,
    whatsOn,
  } = Route.useLoaderData()
  const search = Route.useSearch()

  const crumbs: Crumb[] = [
    { label: site.name, home: true },
    { label: "Directory" },
    ...(primaryCategory
      ? [{ label: primaryCategory.name, categorySlug: primaryCategory.slug }]
      : []),
    { label: listing.title },
  ]

  const coordinates =
    listing.latitude !== null && listing.longitude !== null
      ? { latitude: listing.latitude, longitude: listing.longitude }
      : null

  // What the wide column has to show. Worked out once, because the page asks
  // twice: each card asks whether to draw itself, and the layout asks whether
  // there is a wide column at all.
  const hasWriting =
    !writtenPageBodyIsEmpty(listing.body) || categories.length > 0
  const hasMain =
    hasWriting ||
    listing.gallery.length > 0 ||
    listing.customSections.length > 0 ||
    Boolean(whatsOn?.events.length) ||
    related.length > 0

  // A listing with none of it — no write-up, no tags, no photos, nothing else
  // like it — is drawn as one column instead of a narrow card beside an empty
  // half of the page.
  const main = (
    <>
      {listing.gallery.length ? (
        <Card>
          <ListingGallery title={listing.title} images={listing.gallery} />
        </Card>
      ) : null}

      {hasWriting ? (
        <Card>
          <CardContent className="grid gap-3">
            {/* The search description is not drawn here. It is the sentence
                for a search result and for a card, and on 1,658 of the
                imported listings it is word for word the first line of the
                write-up below — the same thing said twice. A listing page
                shows what the venue says about itself and nothing else. */}
            {categories.length ? (
              <p className="text-xs text-muted-foreground">
                {categories.map((category) => category.name).join(" · ")}
              </p>
            ) : null}
            {/*
             * The same renderer the shell's written pages use. It builds React
             * elements from the stored nodes and never a string of markup, so
             * nothing an admin typed can be anything but the text of a
             * paragraph.
             */}
            <WrittenPageBody body={listing.body} />
          </CardContent>
        </Card>
      ) : null}

      {/* Whatever this site invented, each in a card of its own. Empty
          sections never arrive here — the server leaves them out. */}
      <ListingCustomSections sections={listing.customSections} />

      <ListingEventsBox whatsOn={whatsOn} listingSlug={listing.slug} />

      <RelatedListings listings={related} />
    </>
  )

  const sidebar = (
    <>
      <ListingSidebar
        listing={listing}
        coordinates={coordinates}
        claim={claim}
        startClaimOpen={search.claim === "start"}
      />
      <ListingHoursCard hours={listing.hours} />
    </>
  )

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

      {/* Two columns on a wide screen, the narrow card on the right. */}
      {hasMain ? (
        <div className="grid items-start gap-2 md:gap-3 lg:grid-cols-[minmax(0,1.36fr)_minmax(16rem,0.64fr)]">
          {/* First in the page, and second on a wide screen. On a phone that
              puts the photo, the name and the phone number at the top, which
              is what the page was opened for; `order` moves the wide column
              above it only once the two fit side by side.

              Sticks while the wide column scrolls past it. `top-4` keeps it
              clear of the top of the window rather than touching it. */}
          <div className="grid content-start gap-2 md:gap-3 lg:sticky lg:top-4 lg:order-2">
            {sidebar}
          </div>
          <div className="grid content-start gap-2 md:gap-3 lg:order-1">
            {main}
          </div>
        </div>
      ) : (
        <div className="grid content-start gap-2 md:gap-3 lg:max-w-md">
          {sidebar}
        </div>
      )}
    </DirectoryFrame>
  )
}
