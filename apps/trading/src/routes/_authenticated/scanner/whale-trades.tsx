import { createFileRoute } from "@tanstack/react-router"

import { WhaleTradesDashboard } from "@/components/scanner/whale-trades-dashboard"
import {
  loadWhalesPage,
  whalesFiltersSchema,
  type WhalesFilters,
} from "@/lib/api/scanner"

// Partial in the URL so links/redirects don't need search params; defaults
// are applied by whalesFiltersSchema when querying.
const whaleTradesSearchSchema = whalesFiltersSchema.partial()

export const Route = createFileRoute("/_authenticated/scanner/whale-trades")({
  validateSearch: (search) => whaleTradesSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadWhalesPage(deps),
  component: WhaleTradesRoute,
})

function WhaleTradesRoute() {
  const initial = Route.useLoaderData()
  const filters = whalesFiltersSchema.parse(Route.useSearch())
  const navigate = Route.useNavigate()

  function onFiltersChange(patch: Partial<WhalesFilters>) {
    void navigate({
      search: (prev) => ({
        ...prev,
        // Any non-page filter change resets to the first page.
        page: patch.page ?? 1,
        ...patch,
      }),
      replace: true,
    })
  }

  return (
    <WhaleTradesDashboard
      initial={initial}
      filters={filters}
      onFiltersChange={onFiltersChange}
    />
  )
}
