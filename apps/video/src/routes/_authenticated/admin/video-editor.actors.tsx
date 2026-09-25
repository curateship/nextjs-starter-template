import { createFileRoute } from "@tanstack/react-router"

import { ActorsDashboard } from "@/components/video-assets/actors-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getActorErrorMessage, listActors } from "@/lib/api/video/actors"

export const Route = createFileRoute(
  "/_authenticated/admin/video-editor/actors"
)({
  loader: () => listActors(),
  component: VideoActorsRoute,
  errorComponent: routeErrorComponent(getActorErrorMessage),
})

function VideoActorsRoute() {
  return <ActorsDashboard initial={Route.useLoaderData()} />
}
