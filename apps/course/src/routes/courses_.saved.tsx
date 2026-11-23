import { createFileRoute, redirect } from "@tanstack/react-router"

import { CourseRouteError, SavedChaptersPage } from "@/components/courses/public/course-pages"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadSavedChapters } from "@/lib/api/courses/member"
import { describeAuthError } from "@/lib/api/error-message"

/** /courses/saved: the signed-in member's saved chapters. */
export const Route = createFileRoute("/courses_/saved")({
  loader: async () => {
    await requirePageVisible("/courses")
    try {
      return { saved: await loadSavedChapters() }
    } catch (error) {
      // Somebody signed out has no list, so they are asked to sign in and
      // sent back here after.
      if (describeAuthError(error instanceof Error ? error.message : "")) {
        throw redirect({ to: "/login", search: { redirect: "/courses/saved" } })
      }
      throw error
    }
  },
  head: () => ({ meta: [{ title: "Saved chapters" }] }),
  component: SavedRoute,
  errorComponent: CourseRouteError,
})

function SavedRoute() {
  return <SavedChaptersPage saved={Route.useLoaderData().saved} />
}
