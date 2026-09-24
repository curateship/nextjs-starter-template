import { createFileRoute, notFound } from "@tanstack/react-router"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { EventSubmissionForm } from "@/components/events/public/event-submission-form"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadEventSubmissionForm } from "@/lib/api/events/submissions"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
} from "@/lib/directory/public-seo"

/**
 * The public form for suggesting an event.
 *
 * It follows two switches, and both have to be on: this page's own and the
 * Events page's, because a suggestion for an Events page nobody can see
 * would lead nowhere. The endpoint behind the form checks both again.
 */
export const Route = createFileRoute("/add-event")({
  loader: async () => {
    const [, , form] = await Promise.all([
      requirePageVisible("/add-event"),
      requirePageVisible("/events"),
      loadEventSubmissionForm(),
    ])
    if (!form) throw notFound()
    return form
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return directoryHead(
      directoryTitle("Suggest an event", loaderData.siteName),
      directoryDescription(
        "",
        `Suggest an event for ${loaderData.siteName}. Every suggestion is read before it appears.`
      )
    )
  },
  component: AddEventRoute,
  errorComponent: DirectoryRouteError,
})

function AddEventRoute() {
  const form = Route.useLoaderData()
  return (
    <DirectoryFrame>
      <DirectoryBreadcrumbs
        crumbs={[
          { label: form.siteName, home: true },
          { label: "Events", events: true },
          { label: "Suggest an event" },
        ]}
      />
      <h1 className="text-2xl font-semibold">Suggest an event</h1>
      <EventSubmissionForm form={form} />
    </DirectoryFrame>
  )
}
