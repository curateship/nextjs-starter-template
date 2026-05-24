/* eslint-disable react-refresh/only-export-components */
import { createFileRoute } from "@tanstack/react-router"

import { GenerationResultPage } from "@/components/videos-page"

export const Route = createFileRoute(
  "/_authenticated/admin/modules/ugc-ad-video/generations/$generationId"
)({
  component: GenerationRoute,
})

function GenerationRoute() {
  const { generationId } = Route.useParams()
  return <GenerationResultPage generationId={generationId} />
}
