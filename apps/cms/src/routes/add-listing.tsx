import { createFileRoute, notFound } from "@tanstack/react-router"

import {
  DirectoryBreadcrumbs,
  type Crumb,
} from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { ListingSubmissionForm } from "@/components/directory/public/submission-form"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadSubmissionForm } from "@/lib/api/directory/submissions"
import { directoryDescription, directoryHead, directoryTitle } from "@/lib/directory/public-seo"

/**
 * The public form for suggesting a listing.
 *
 * It follows two switches, and both have to be on: this page's own, and the
 * directory's — offering to add something to a directory that is switched off
 * would be a form leading nowhere. There is no site at the platform host, so
 * the loader answers not-found there rather than drawing an orphan form.
 */
export const Route = createFileRoute("/add-listing")({
  loader: async () => {
    const [, , form] = await Promise.all([
      requirePageVisible("/add-listing"),
      requirePageVisible("/directory"),
      loadSubmissionForm(),
    ])

    if (!form) throw notFound()
    return form
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return directoryHead(
      directoryTitle("Add your listing", loaderData.siteName),
      directoryDescription(
        "",
        `Suggest a business for ${loaderData.siteName}. Every submission is checked before it appears.`
      )
    )
  },
  component: AddListingRoute,
  errorComponent: DirectoryRouteError,
})

function AddListingRoute() {
  const form = Route.useLoaderData()

  const crumbs: Crumb[] = [
    { label: form.siteName, home: true },
    { label: "Directory" },
    { label: "Add your listing" },
  ]

  return (
    <DirectoryFrame>
      <DirectoryBreadcrumbs crumbs={crumbs} />
      <h1 className="text-2xl font-semibold">Add your listing</h1>
      <ListingSubmissionForm form={form} />
    </DirectoryFrame>
  )
}
