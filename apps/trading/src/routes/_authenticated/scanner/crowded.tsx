import { createFileRoute } from "@tanstack/react-router"

import { CrowdedDashboard } from "@/components/scanner/crowded-dashboard"
import {
  crowdSignalsFiltersSchema,
  loadCrowdSignals,
  type CrowdSignalsFilters,
} from "@/lib/api/scanner"

const crowdedSearchSchema = crowdSignalsFiltersSchema.partial()

export const Route = createFileRoute("/_authenticated/scanner/crowded")({
  validateSearch: (search) => crowdedSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadCrowdSignals(deps),
  component: CrowdedRoute,
})

function CrowdedRoute() {
  const initial = Route.useLoaderData()
  const filters = crowdSignalsFiltersSchema.parse(Route.useSearch())
  const navigate = Route.useNavigate()

  function onFiltersChange(patch: Partial<CrowdSignalsFilters>) {
    void navigate({
      search: (prev) => ({
        ...prev,
        // Any non-page change resets to the first page.
        page: patch.page ?? 1,
        ...patch,
      }),
      replace: true,
    })
  }

  return (
    <CrowdedDashboard
      initial={initial}
      filters={filters}
      onFiltersChange={onFiltersChange}
    />
  )
}
