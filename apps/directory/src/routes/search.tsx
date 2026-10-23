import { createFileRoute } from "@tanstack/react-router"

import { SiteSearchPage, SiteSearchRouteError } from "@/components/pages/site-search-page"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadSiteSearch } from "@/lib/api/content/search"
import { readSearchText } from "@/lib/nav/list-search"

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: readSearchText(search.q),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [, results] = await Promise.all([
      requirePageVisible("/search"),
      deps.q ? loadSiteSearch(deps.q) : Promise.resolve([]),
    ])
    return results
  },
  head: () => ({ meta: [{ title: "Search" }] }),
  component: SearchRoute,
  errorComponent: SiteSearchRouteError,
})

function SearchRoute() {
  return <SiteSearchPage query={Route.useSearch().q ?? ""} results={Route.useLoaderData()} />
}
