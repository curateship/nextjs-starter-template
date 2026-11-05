import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { LibraryPage, type LibraryPageSearch } from "@/components/viral/library-page"
import { loadSavedViews } from "@/lib/api/saved-views"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadLibrary } from "@/lib/api/viral/viral-library"
import { loadViralProjects } from "@/lib/api/viral/viral-projects"
import { readSearchText } from "@/lib/nav/list-search"
import { savedViewScreen } from "@/lib/saved-views"
import { LIBRARY_SAVED_VIEW_KIND, readLibraryTab } from "@/lib/viral/library"
import { cleanTag } from "@/lib/viral/vault"

/** An id's shape only; whether it is theirs is the loader's job. */
function readId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,36}$/.test(value) ? value : undefined
}

/**
 * The Library page (`workspace/docs/library.md`): Hooks across every project
 * and saved Formats. The tab, the picked project, the search, the tag and the
 * open hook or format all live in the address. Archived projects are left out
 * of the left panel.
 */
export const Route = createFileRoute("/_authenticated/admin/library")({
  validateSearch: (search: Record<string, unknown>): LibraryPageSearch => {
    const tab = readLibraryTab(search.tab)
    const tag = typeof search.tag === "string" ? cleanTag(search.tag) : ""
    return {
      tab: tab === "hooks" ? undefined : tab,
      project: readId(search.project),
      q: readSearchText(search.q),
      tag: tag || undefined,
      open: readId(search.open),
    }
  },
  loader: async () => {
    const [library, list, views] = await Promise.all([
      loadLibrary(),
      loadViralProjects({ archived: false }),
      loadSavedViews(savedViewScreen(LIBRARY_SAVED_VIEW_KIND, "")),
    ])
    return {
      ...library,
      projects: list.projects.map((project) => ({ id: project.id, name: project.name, sample: project.sample })),
      views,
    }
  },
  component: LibraryRoute,
  errorComponent: routeErrorComponent(getViralErrorMessage),
})

function LibraryRoute() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  return (
    <LibraryPage
      hooks={data.hooks}
      formats={data.formats}
      tags={data.tags}
      projects={data.projects}
      views={data.views}
      scriptPriceCents={data.scriptPriceCents}
      search={search}
    />
  )
}
