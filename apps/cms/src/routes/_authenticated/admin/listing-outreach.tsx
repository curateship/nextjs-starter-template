import { createFileRoute } from "@tanstack/react-router"

import { OutreachDashboard } from "@/components/directory/outreach-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getOutreachErrorMessage, loadOutreach } from "@/lib/api/directory/outreach"

export const Route = createFileRoute("/_authenticated/admin/listing-outreach")({
  loader: loadOutreach,
  component: ListingOutreachRoute,
  errorComponent: routeErrorComponent(getOutreachErrorMessage),
})

function ListingOutreachRoute() {
  return <OutreachDashboard data={Route.useLoaderData()} />
}
