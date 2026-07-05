import { createFileRoute } from "@tanstack/react-router"

import { PositionsDashboard } from "@/components/scanner/positions-dashboard"
import {
  loadPositionEvents,
  positionEventsFiltersSchema,
  type PositionEventsFilters,
} from "@/lib/api/scanner"

const positionsSearchSchema = positionEventsFiltersSchema.partial()

export const Route = createFileRoute("/_authenticated/scanner/positions")({
  validateSearch: (search) => positionsSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadPositionEvents(deps),
  component: PositionsRoute,
})

function PositionsRoute() {
  const initial = Route.useLoaderData()
  const filters = positionEventsFiltersSchema.parse(Route.useSearch())
  const navigate = Route.useNavigate()

  function onFiltersChange(patch: Partial<PositionEventsFilters>) {
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
    <PositionsDashboard
      initial={initial}
      filters={filters}
      onFiltersChange={onFiltersChange}
    />
  )
}
