import { createFileRoute } from "@tanstack/react-router"

import { AdminPagesDashboard } from "@/components/admin/admin-pages-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getPagesErrorMessage, loadPagesOverview } from "@/lib/api/content/pages"
import { PAGE_GROUPS } from "@/lib/pages/page-groups"
import { readOneOf, readSearchText } from "@/lib/nav/list-search"

export const Route = createFileRoute("/_authenticated/admin/pages")({
  // The search and the chosen tab live in the address, so the screen can be
  // linked and reloaded. They filter the rows already in hand — nothing
  // refetches.
  validateSearch: (search: Record<string, unknown>) => ({
    q: readSearchText(search.q),
    group: readOneOf(search.group, PAGE_GROUPS),
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
      group={search.group ?? "yours"}
    />
  )
}
