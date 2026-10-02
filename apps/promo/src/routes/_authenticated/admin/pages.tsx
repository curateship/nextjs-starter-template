import { createFileRoute } from "@tanstack/react-router"

import { AdminPagesDashboard } from "@/components/admin/admin-pages-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getPagesErrorMessage, loadPagesOverview } from "@/lib/api/content/pages"
import { readSearchText } from "@/lib/nav/list-search"

export const Route = createFileRoute("/_authenticated/admin/pages")({
  // The search lives in the address, so the page can be linked and reloaded.
  // It filters the rows already in hand — nothing refetches.
  validateSearch: (search: Record<string, unknown>) => ({
    q: readSearchText(search.q),
  }),
  loader: () => loadPagesOverview(),
  component: AdminPagesRoute,
  errorComponent: routeErrorComponent(getPagesErrorMessage),
})

function AdminPagesRoute() {
  const search = Route.useSearch()

  return (
    <AdminPagesDashboard
      data={Route.useLoaderData()}
      searchText={search.q ?? ""}
    />
  )
}
