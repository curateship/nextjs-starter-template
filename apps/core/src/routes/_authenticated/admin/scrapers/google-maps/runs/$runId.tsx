/* eslint-disable react-refresh/only-export-components */
import { createFileRoute } from "@tanstack/react-router"

import { GoogleMapsRunResults } from "@/scrapers/google-maps/dashboard"

export const Route = createFileRoute(
  "/_authenticated/admin/scrapers/google-maps/runs/$runId"
)({
  component: RouteComponent,
})

function RouteComponent() {
  return <GoogleMapsRunResults runId={Route.useParams().runId} />
}
