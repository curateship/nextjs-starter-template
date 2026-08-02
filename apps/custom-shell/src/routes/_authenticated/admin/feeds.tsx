import { createFileRoute } from "@tanstack/react-router"

import { AdminFeedsDashboard } from "@/components/admin/admin-feeds-dashboard"
import { getFeedsErrorMessage, loadFeeds } from "@/lib/api/feeds"
import { routeErrorComponent } from "@/components/shell/route-error"

export const Route = createFileRoute("/_authenticated/admin/feeds")({
  loader: async () => ({ summary: await loadFeeds() }),
  component: AdminFeedsRoute,
  errorComponent: routeErrorComponent(getFeedsErrorMessage),
})

function AdminFeedsRoute() {
  const { summary } = Route.useLoaderData()

  return <AdminFeedsDashboard summary={summary} />
}
