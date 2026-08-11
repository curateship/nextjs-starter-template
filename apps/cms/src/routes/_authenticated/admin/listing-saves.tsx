import { createFileRoute } from "@tanstack/react-router"

import { SavesDashboard } from "@/components/directory/saves-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getSaveErrorMessage, loadMostSaved } from "@/lib/api/directory/saves"

export const Route = createFileRoute("/_authenticated/admin/listing-saves")({
  loader: loadMostSaved,
  component: ListingSavesRoute,
  errorComponent: routeErrorComponent(getSaveErrorMessage),
})

function ListingSavesRoute() {
  return <SavesDashboard rows={Route.useLoaderData()} />
}
