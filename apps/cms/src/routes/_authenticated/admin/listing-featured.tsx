import { createFileRoute } from "@tanstack/react-router"

import { FeaturedDashboard } from "@/components/directory/featured-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getFeaturedErrorMessage, loadFeaturedAdmin } from "@/lib/api/directory/featured"

export const Route = createFileRoute("/_authenticated/admin/listing-featured")({
  loader: loadFeaturedAdmin,
  component: ListingFeaturedRoute,
  errorComponent: routeErrorComponent(getFeaturedErrorMessage),
})

function ListingFeaturedRoute() {
  return <FeaturedDashboard data={Route.useLoaderData()} />
}
