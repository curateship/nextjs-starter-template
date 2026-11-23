import { createFileRoute, notFound } from "@tanstack/react-router"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { GuideGrid } from "@/components/directory/public/guide-grid"
import { PublicTitleBand } from "@/components/shared/public-title-band"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadGuides } from "@/lib/api/directory/public"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
} from "@/lib/directory/public-seo"

/**
 * The Guides page: every published guide on the site, newest first. A draft
 * is never selected, so it is not on the page. Tyler asked for this page on
 * 17 Oct 2026, so the guides can be found from one place as well as by a
 * shared link.
 */
export const Route = createFileRoute("/guides")({
  loader: async () => {
    const [, list] = await Promise.all([
      requirePageVisible("/guides"),
      loadGuides(),
    ])
    if (!list) throw notFound()
    return list
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return directoryHead(
      directoryTitle("Guides", loaderData.site.name),
      directoryDescription(`Guides to the best places, from ${loaderData.site.name}.`)
    )
  },
  component: GuidesRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function GuidesRoute() {
  const { site, guides } = Route.useLoaderData()
  return (
    <DirectoryFrame
      hero={
        <PublicTitleBand
          crumbs={
            <DirectoryBreadcrumbs
              crumbs={[{ label: site.name, home: true }, { label: "Guides" }]}
              inBand
            />
          }
          title="Guides"
        />
      }
    >
      <GuideGrid
        guides={guides}
        emptyMessage="No guides have been published yet."
      />
    </DirectoryFrame>
  )
}
