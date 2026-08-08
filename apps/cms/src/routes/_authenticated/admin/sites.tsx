import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { SitesDashboard } from "@/components/sites/sites-dashboard"
import { getSiteErrorMessage, loadSites } from "@/lib/api/sites/sites"
import { readSearchText } from "@/lib/nav/list-search"

export const Route = createFileRoute("/_authenticated/admin/sites")({
  // The search lives in the address, so the page can be linked and reloaded.
  // It filters the rows already in hand — nothing refetches.
  validateSearch: (search: Record<string, unknown>) => ({
    q: readSearchText(search.q),
  }),
  loader: () => loadSites(),
  component: AdminSitesRoute,
  errorComponent: routeErrorComponent(getSiteErrorMessage),
})

function AdminSitesRoute() {
  const search = Route.useSearch()
  const { sites, baseDomain } = Route.useLoaderData()

  return (
    <SitesDashboard
      sites={sites}
      baseDomain={baseDomain}
      searchText={search.q ?? ""}
    />
  )
}
