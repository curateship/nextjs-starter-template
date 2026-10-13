import { createFileRoute } from "@tanstack/react-router"

import { ActorsDashboard } from "@/components/video-assets/actors-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getActorErrorMessage, listActors } from "@/lib/api/video/actors"
import { listProjects } from "@/lib/api/video/projects"

export const Route = createFileRoute(
  "/_authenticated/admin/video-editor/actors"
)({
  loader: async () => {
    const [actors, projects] = await Promise.all([
      listActors(),
      listProjects({ pageSize: 100 }),
    ])
    return { actors, projects: projects.projects }
  },
  component: VideoActorsRoute,
  errorComponent: routeErrorComponent(getActorErrorMessage),
})

function VideoActorsRoute() {
  const data = Route.useLoaderData()
  return <ActorsDashboard initial={data.actors} projects={data.projects} />
}
