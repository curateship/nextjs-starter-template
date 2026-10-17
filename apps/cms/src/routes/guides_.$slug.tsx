import { createFileRoute } from "@tanstack/react-router"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { JsonLd } from "@/components/directory/public/json-ld"
import { ListingGrid } from "@/components/directory/public/listing-grid"
import { PublicTitleBand } from "@/components/shared/public-title-band"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadGuide } from "@/lib/api/directory/public"
import { forwardOldAddress } from "@/lib/api/directory/old-addresses"
import { guidePlacesText } from "@/lib/directory/guides"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
  guideJsonLd,
  guidePageShareImage,
} from "@/lib/directory/public-seo"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"

/**
 * One guide's page at /guides/<address>: its cover, title and intro in the
 * band at the top, then its listings in the editor's order as the cards the
 * browse page draws. It follows the Guides page's on/off switch.
 *
 * A listing that is not published is left out, so a guide can hold nine and
 * show eight. A guide with none to show says so rather than failing.
 *
 * No such address, a draft, and another site's guide all answer the same
 * not-found page, so a draft cannot be told apart from a guide never written.
 */
export const Route = createFileRoute("/guides_/$slug")({
  loader: async ({ params }) => {
    const [, page] = await Promise.all([
      requirePageVisible("/guides"),
      loadGuide(params.slug),
    ])
    // An address the guide used to have forwards to the one it has now.
    if (!page) return forwardOldAddress("guide", params.slug)
    return page
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { guide, site, shareImageVersion } = loaderData
    return directoryHead(
      directoryTitle(guide.title, site.name),
      directoryDescription(guide.intro, `${guide.title} on ${site.name}.`),
      guidePageShareImage({
        coverImage: guide.coverImage,
        siteUrl: site.url,
        slug: guide.slug,
        version: shareImageVersion,
      })
    )
  },
  component: GuideRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function GuideRoute() {
  const { site, guide, listings } = Route.useLoaderData()

  return (
    <DirectoryFrame
      hero={
        <PublicTitleBand
          crumbs={
            <DirectoryBreadcrumbs
              crumbs={[
                { label: site.name, home: true },
                { label: "Guides", guides: true },
                { label: guide.title },
              ]}
              inBand
            />
          }
          title={guide.title}
          intro={
            <div className="flex max-w-prose flex-col gap-2">
              {guide.intro ? (
                // Plain text, drawn as text: whatever was typed can only ever
                // be the words of a paragraph.
                <p className="text-base whitespace-pre-line text-muted-foreground">
                  {guide.intro}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {guidePlacesText(listings.length)}
              </p>
            </div>
          }
          picture={
            guide.coverImage ? (
              <img
                src={guide.coverImage}
                srcSet={mediaImageSrcSet(guide.coverImage)}
                // `max-w-xs`: never wider than 320px, like a category's.
                sizes="320px"
                alt=""
                className="aspect-[4/3] w-full max-w-xs rounded-xl object-cover"
              />
            ) : undefined
          }
        />
      }
    >
      <JsonLd
        data={guideJsonLd({
          siteName: site.name,
          siteUrl: site.url,
          title: guide.title,
          slug: guide.slug,
          intro: guide.intro,
          image: guide.coverImage,
          listings,
        })}
      />
      <ListingGrid
        listings={listings}
        emptyMessage="There is nothing to show in this guide right now."
      />
    </DirectoryFrame>
  )
}
