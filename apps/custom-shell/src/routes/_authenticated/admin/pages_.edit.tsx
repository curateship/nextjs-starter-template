import { createFileRoute, redirect } from "@tanstack/react-router"

import { FrontPageEditor } from "@/components/pages/front-page-editor"
import { routeErrorComponent } from "@/components/shell/route-error"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { getPagesErrorMessage, loadPagesOverview } from "@/lib/api/content/pages"
import {
  FRONT_PAGE_PATH,
  MAX_PAGE_PATH_LENGTH,
} from "@/lib/pages/page-descriptor"

/**
 * Which page is being built, as its address: `?path=/`.
 *
 * The address and not a slug, because a page is known by where it answers
 * everywhere else in the app, and `/` has no segment that could sit in the
 * route's own path. A junk value falls back to the front page rather than
 * breaking the screen.
 */
function readEditSearch(search: Record<string, unknown>) {
  const path = search.path
  return {
    path:
      typeof path === "string" &&
      path.startsWith("/") &&
      path.length <= MAX_PAGE_PATH_LENGTH
        ? path
        : FRONT_PAGE_PATH,
  }
}

export const Route = createFileRoute("/_authenticated/admin/pages_/edit")({
  validateSearch: readEditSearch,
  loader: async ({ location }) => {
    const { path } = readEditSearch(location.search as Record<string, unknown>)
    // Only the front page is built from blocks today. Every other page is code
    // an app wrote or words an admin wrote, so there is nothing here to edit
    // and the list is the honest place to land.
    if (path !== FRONT_PAGE_PATH) {
      throw redirect({ to: "/admin/pages", search: { q: undefined } })
    }
    const overview = await loadPagesOverview()
    const page = overview.rows.find((row) => row.path === path)
    if (!page) {
      throw redirect({ to: "/admin/pages", search: { q: undefined } })
    }
    return { page }
  },
  component: AdminFrontPageEditorRoute,
  errorComponent: routeErrorComponent(getPagesErrorMessage),
})

function AdminFrontPageEditorRoute() {
  const { page } = Route.useLoaderData()
  const runtime = useShellRuntime()

  return (
    <FrontPageEditor
      page={page}
      config={runtime.config}
      onConfigChange={runtime.onConfigChange}
    />
  )
}
