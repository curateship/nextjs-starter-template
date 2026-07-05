import { createFileRoute } from "@tanstack/react-router"

import { WhalesDashboard } from "@/components/scanner/whales-dashboard"
import {
  loadWhaleWallets,
  whaleWalletsFiltersSchema,
  type WhaleWalletsFilters,
} from "@/lib/api/scanner"

const whalesSearchSchema = whaleWalletsFiltersSchema.partial()

export const Route = createFileRoute("/_authenticated/scanner/whales/")({
  validateSearch: (search) => whalesSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadWhaleWallets(deps),
  component: WhalesRoute,
})

function WhalesRoute() {
  const initial = Route.useLoaderData()
  const filters = whaleWalletsFiltersSchema.parse(Route.useSearch())
  const navigate = Route.useNavigate()

  function onFiltersChange(patch: Partial<WhaleWalletsFilters>) {
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
    <WhalesDashboard
      initial={initial}
      filters={filters}
      onFiltersChange={onFiltersChange}
    />
  )
}
