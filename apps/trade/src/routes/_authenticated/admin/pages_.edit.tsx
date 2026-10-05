import { createFileRoute, redirect } from "@tanstack/react-router"

import { FrontPageEditor } from "@/components/pages/front-page-editor"
import { routeErrorComponent } from "@/components/shell/route-error"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { loadPageBlocks } from "@/lib/api/content/page-blocks"
import {
  getPagesErrorMessage,
  loadPagesOverview,
  loadWrittenPageForEdit,
} from "@/lib/api/content/pages"
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
    const overview = await loadPagesOverview()
    const page = overview.rows.find((row) => row.path === path)
    // A page that is not built from blocks has nothing to edit here, and the
    // list is the honest place to land. The page's own card decides, so an app
    // that gives a second page blocks gets this screen with no change here.
    if (!page?.blocks) {
      throw redirect({
        to: "/admin/pages",
        search: { q: undefined, group: undefined },
      })
    }
    // The page's own row, when an admin added it. A page the code declares has
    // none, and its name and address are in its file rather than in a table.
    const [blocks, writtenPage] = await Promise.all([
      loadPageBlocks(path),
      page.writtenPageId ? loadWrittenPageForEdit(path) : null,
    ])
    return { page, blocks, writtenPage }
  },
  component: AdminFrontPageEditorRoute,
  errorComponent: routeErrorComponent(getPagesErrorMessage),
})

function AdminFrontPageEditorRoute() {
  const { page, blocks, writtenPage } = Route.useLoaderData()
  const runtime = useShellRuntime()

  return (
    <FrontPageEditor
      page={page}
      writtenPage={writtenPage}
      initialBlocks={blocks}
      config={runtime.config}
      onConfigChange={runtime.onConfigChange}
    />
  )
}
