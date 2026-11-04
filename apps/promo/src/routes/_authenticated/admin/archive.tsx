import { createFileRoute } from "@tanstack/react-router"

import { ArchiveDashboard } from "@/components/archive/archive-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getArchiveErrorMessage, loadArchiveProjects } from "@/lib/api/archive/items"
import { loadSavedViews } from "@/lib/api/saved-views"
import { ARCHIVE_VIEW_KIND, readArchiveSearch } from "@/lib/archive/search"

/**
 * The Archive (`workspace/docs/archive.md`): every project's videos,
 * carousels and pictures, sent from Video or uploaded. The picked project,
 * the open item and the filters live in the address
 * (`?project=<id>&open=<id>&kind=video`), so a bell notice or Video's Open in
 * Promo lands on the item.
 */
export const Route = createFileRoute("/_authenticated/admin/archive")({
  validateSearch: (search: Record<string, unknown>) => readArchiveSearch(search),
  loaderDeps: ({ search }) => ({ project: search.project }),
  loader: async ({ deps }) => {
    const projects = await loadArchiveProjects()
    const projectId = projects.find((row) => row.id === deps.project)?.id ?? projects[0]?.id
    const views = projectId ? await loadSavedViews(`${ARCHIVE_VIEW_KIND}:${projectId}`) : []
    return { projects, views }
  },
  component: ArchiveRoute,
  errorComponent: routeErrorComponent(getArchiveErrorMessage),
})

function ArchiveRoute() {
  const { projects, views } = Route.useLoaderData()
  return <ArchiveDashboard projects={projects} views={views} search={Route.useSearch()} />
}
