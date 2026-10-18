import { createFileRoute } from "@tanstack/react-router"

import { AdminTrafficDashboard } from "@/components/admin/admin-traffic-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getTrafficErrorMessage,
  loadTrafficSummary,
  readTrafficRange,
} from "@/lib/api/traffic"

export const Route = createFileRoute("/_authenticated/admin/traffic")({
  // The range lives in the address, so the page can be linked and reloaded.
  validateSearch: (search: Record<string, unknown>) => ({
    days: readTrafficRange(search.days),
  }),
  loaderDeps: ({ search }) => ({ days: search.days ?? 30 }),
  loader: ({ deps }) => loadTrafficSummary(deps.days),
  component: AdminTrafficRoute,
  errorComponent: routeErrorComponent(getTrafficErrorMessage),
})

function AdminTrafficRoute() {
  const search = Route.useSearch()

  return (
    <AdminTrafficDashboard
      data={Route.useLoaderData()}
      range={search.days ?? 30}
    />
  )
}
