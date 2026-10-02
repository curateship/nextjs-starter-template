import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { ResearchPage } from "@/components/video-creators/research-page"
import {
  getCreatorErrorMessage,
  loadResearchData,
} from "@/lib/api/video/creators"

/**
 * The creator research dashboard. Everything it opens with is read before the
 * page draws, so there is no empty frame filling itself in.
 */
export const Route = createFileRoute("/_authenticated/admin/video-creators")({
  loader: () => loadResearchData(),
  component: AdminVideoCreatorsRoute,
  errorComponent: routeErrorComponent(getCreatorErrorMessage),
})

function AdminVideoCreatorsRoute() {
  return <ResearchPage initial={Route.useLoaderData()} />
}
