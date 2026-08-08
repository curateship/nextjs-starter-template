import { createFileRoute } from "@tanstack/react-router"

import { CategoriesDashboard } from "@/components/directory/categories-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getCategoryErrorMessage,
  loadCategories,
} from "@/lib/api/directory/categories"
import { readSearchText } from "@/lib/nav/list-search"

export const Route = createFileRoute("/_authenticated/admin/categories")({
  // The search lives in the address, so the page can be linked and reloaded.
  // It filters the rows already in hand — nothing refetches.
  validateSearch: (search: Record<string, unknown>) => ({
    q: readSearchText(search.q),
  }),
  loader: () => loadCategories(),
  component: AdminCategoriesRoute,
  errorComponent: routeErrorComponent(getCategoryErrorMessage),
})

function AdminCategoriesRoute() {
  const search = Route.useSearch()

  return (
    <CategoriesDashboard
      categories={Route.useLoaderData()}
      searchText={search.q ?? ""}
    />
  )
}
