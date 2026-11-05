import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { SharePage } from "@/components/viral/share-page"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadViralProjects } from "@/lib/api/viral/viral-projects"
import { findSharedLink } from "@/lib/viral/share"

type ShareSearch = { url?: string; text?: string; title?: string }

/** A shared field, kept only when it is text of a sane length. */
function readShared(value: unknown) {
  return typeof value === "string" && value.length <= 4_096 ? value : undefined
}

/**
 * Save from your phone (`workspace/docs/phone-save.md`): the page a phone's
 * share opens, with the shared link in `?url=`, `?text=` or `?title=`. Only
 * the person's own projects that aren't archived or samples are offered.
 */
export const Route = createFileRoute("/_authenticated/admin/share")({
  validateSearch: (search: Record<string, unknown>): ShareSearch => ({
    url: readShared(search.url),
    text: readShared(search.text),
    title: readShared(search.title),
  }),
  loader: async () => {
    const list = await loadViralProjects({ archived: false })
    return {
      projects: list.projects.filter((project) => !project.sample).map((project) => ({ id: project.id, name: project.name })),
    }
  },
  component: ShareRoute,
  errorComponent: routeErrorComponent(getViralErrorMessage),
})

function ShareRoute() {
  const { projects } = Route.useLoaderData()
  const search = Route.useSearch()
  return <SharePage link={findSharedLink(search)} projects={projects} />
}
