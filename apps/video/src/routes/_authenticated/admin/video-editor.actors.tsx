import { createFileRoute } from "@tanstack/react-router"

import { ActorsDashboard } from "@/components/video-assets/actors-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getActorErrorMessage, listActors } from "@/lib/api/video/actors"
import { listExtras } from "@/lib/api/video/extras"
import { listProjects } from "@/lib/api/video/projects"
import { readOneOf } from "@/lib/nav/list-search"
import { EXTRA_KINDS } from "@/lib/video/extras"

export const Route = createFileRoute(
  "/_authenticated/admin/video-editor/actors"
)({
  // Which tab is open: the actors, or one kind of extra. Actors is the default
  // and stays out of the address.
  validateSearch: (search: Record<string, unknown>) => ({
    tab: readOneOf(search.tab, EXTRA_KINDS),
  }),
  loader: async () => {
    const [actors, extras, projects] = await Promise.all([
      listActors(),
      listExtras(),
      listProjects({ pageSize: 100 }),
    ])
    return { actors, extras: extras.extras, projects: projects.projects }
  },
  component: VideoActorsRoute,
  errorComponent: routeErrorComponent(getActorErrorMessage),
})

function VideoActorsRoute() {
  const data = Route.useLoaderData()
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <ActorsDashboard
      initial={data.actors}
      initialExtras={data.extras}
      projects={data.projects}
      tab={tab ?? "actors"}
      onTabChange={(next) =>
        void navigate({
          search: { tab: next === "actors" ? undefined : next },
          replace: true,
        })
      }
    />
  )
}
