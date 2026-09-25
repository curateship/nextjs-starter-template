import { createFileRoute } from "@tanstack/react-router"

import { FirstFramesDashboard } from "@/components/video-assets/first-frames-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { listActors } from "@/lib/api/video/actors"
import {
  getFirstFrameErrorMessage,
  listFirstFrames,
} from "@/lib/api/video/first-frames"
import { listProjects } from "@/lib/api/video/projects"

function readSearch(search: Record<string, unknown>) {
  return {
    actor:
      typeof search.actor === "string" && search.actor.length <= 36
        ? search.actor
        : undefined,
  }
}

export const Route = createFileRoute(
  "/_authenticated/admin/video-editor/first-frames"
)({
  validateSearch: readSearch,
  loaderDeps: ({ search }) => ({ actor: search.actor }),
  loader: async ({ deps }) => {
    const [frames, actors, projects] = await Promise.all([
      listFirstFrames(),
      listActors(),
      listProjects({ pageSize: 100 }),
    ])
    return {
      frames,
      actors: actors.actors,
      projects: projects.projects,
      initialActorId: deps.actor,
    }
  },
  component: VideoFirstFramesRoute,
  errorComponent: routeErrorComponent(getFirstFrameErrorMessage),
})

function VideoFirstFramesRoute() {
  const data = Route.useLoaderData()
  return (
    <FirstFramesDashboard
      initial={data.frames}
      actors={data.actors}
      projects={data.projects}
      initialActorId={data.initialActorId}
    />
  )
}
