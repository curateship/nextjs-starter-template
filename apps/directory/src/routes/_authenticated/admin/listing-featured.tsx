import { createFileRoute } from "@tanstack/react-router"

import { FeaturedDashboard } from "@/components/directory/featured-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadCategories } from "@/lib/api/directory/categories"
import { getFeaturedErrorMessage, loadFeaturedAdmin } from "@/lib/api/directory/featured"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"

type FeaturedSearch = {
  /** The search box, matched against listing title and buyer email. */
  q?: string
  page?: number
  size?: number
}

function readFeaturedSearch(search: Record<string, unknown>): FeaturedSearch {
  return {
    q: readSearchText(search.q),
    page: readPage(search.page),
    size: readOneOf(
      String(search.size),
      DASHBOARD_ROWS_PER_PAGE_OPTIONS.map(String)
    )
      ? Number(search.size)
      : undefined,
  }
}

export const Route = createFileRoute("/_authenticated/admin/listing-featured")({
  validateSearch: readFeaturedSearch,
  loaderDeps: ({ search }) => search,
  // The categories come with the page rather than when the plan window opens,
  // so the Category select is already filled the moment it is on screen.
  loader: async ({ deps }) => {
    const [data, categories] = await Promise.all([
      loadFeaturedAdmin({ search: deps.q, page: deps.page, limit: deps.size }),
      loadCategories(),
    ])
    return { data, categories }
  },
  component: ListingFeaturedRoute,
  errorComponent: routeErrorComponent(getFeaturedErrorMessage),
})

function ListingFeaturedRoute() {
  const { data, categories } = Route.useLoaderData()
  return (
    <FeaturedDashboard
      data={data}
      categories={categories}
      search={Route.useSearch()}
    />
  )
}
