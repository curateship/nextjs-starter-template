import { createFileRoute, notFound } from "@tanstack/react-router"

import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { requirePageVisible } from "@/lib/api/content/pages"

/**
 * The Events page's own address. The list of events that belongs here is not
 * built yet, so for now this only obeys the page's switch and then answers
 * not-found. The switch is what matters today: every event's page follows it.
 */
export const Route = createFileRoute("/events")({
  loader: async () => {
    await requirePageVisible("/events")
    throw notFound()
  },
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})
