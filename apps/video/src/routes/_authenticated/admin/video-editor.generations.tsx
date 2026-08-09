import { createFileRoute } from "@tanstack/react-router"

import { GenerationsDashboard } from "@/components/video-assets/generations-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { listFirstFrames } from "@/lib/api/video/first-frames"
import {
  getGenerationErrorMessage,
  listGenerations,
} from "@/lib/api/video/generations"
import { listProjects } from "@/lib/api/video/projects"

export const Route = createFileRoute(
  "/_authenticated/admin/video-editor/generations"
)({
  loader: async () => {
    const [generations, frames, projects] = await Promise.all([
      listGenerations(),
      listFirstFrames(),
      listProjects({ pageSize: 100 }),
    ])
    return {
      generations,
      frames: frames.firstFrames,
      projects: projects.projects,
    }
  },
  component: VideoGenerationsRoute,
  errorComponent: routeErrorComponent(getGenerationErrorMessage),
})

function VideoGenerationsRoute() {
  const data = Route.useLoaderData()
  return (
    <GenerationsDashboard
      initial={data.generations}
      frames={data.frames}
      projects={data.projects}
    />
  )
}
