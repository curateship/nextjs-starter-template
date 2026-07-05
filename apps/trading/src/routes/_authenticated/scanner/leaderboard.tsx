import { createFileRoute } from "@tanstack/react-router"

import { LeaderboardDashboard } from "@/components/scanner/leaderboard-dashboard"
import {
  leaderboardFiltersSchema,
  loadLeaderboard,
  type LeaderboardFilters,
} from "@/lib/api/scanner"

const leaderboardSearchSchema = leaderboardFiltersSchema.partial()

export const Route = createFileRoute("/_authenticated/scanner/leaderboard")({
  validateSearch: (search) => leaderboardSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadLeaderboard(deps),
  component: LeaderboardRoute,
})

function LeaderboardRoute() {
  const initial = Route.useLoaderData()
  const filters = leaderboardFiltersSchema.parse(Route.useSearch())
  const navigate = Route.useNavigate()

  function onFiltersChange(patch: Partial<LeaderboardFilters>) {
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
    <LeaderboardDashboard
      initial={initial}
      filters={filters}
      onFiltersChange={onFiltersChange}
    />
  )
}
