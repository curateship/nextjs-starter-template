import { createFileRoute } from "@tanstack/react-router"

import { AdminAiUsageDashboard } from "@/components/admin/admin-ai-usage-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  AI_USAGE_RANGES,
  getAiErrorMessage,
  loadAiUsageDashboard,
} from "@/lib/api/ai"
import { readOneOf, readSearchText } from "@/lib/nav/list-search"

export const Route = createFileRoute("/_authenticated/admin/ai")({
  // The range and the person search live in the address, so the page can be
  // linked and reloaded. Only the range refetches — the search filters the
  // aggregates already in hand.
  validateSearch: (search: Record<string, unknown>) => ({
    range: readOneOf(search.range, AI_USAGE_RANGES),
    q: readSearchText(search.q),
  }),
  loaderDeps: ({ search }) => ({ range: search.range ?? "month" }),
  loader: ({ deps }) => loadAiUsageDashboard(deps.range),
  component: AdminAiUsageRoute,
  errorComponent: routeErrorComponent(getAiErrorMessage),
})

function AdminAiUsageRoute() {
  const runtime = useShellRuntime()
  const search = Route.useSearch()

  return (
    <AdminAiUsageDashboard
      data={Route.useLoaderData()}
      range={search.range ?? "month"}
      searchText={search.q ?? ""}
      defaultPageSize={runtime.config.dashboardRowsPerPage}
    />
  )
}
