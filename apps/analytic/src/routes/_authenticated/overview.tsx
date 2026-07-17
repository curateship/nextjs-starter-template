import { createFileRoute } from "@tanstack/react-router"

import { OverviewDashboard } from "@/components/overview-dashboard"
import { loadOverview, type OverviewRange } from "@/lib/api/overview"
import { loadSites } from "@/lib/api/sites"

const DEFAULT_RANGE: OverviewRange = "7d"

export const Route = createFileRoute("/_authenticated/overview")({
  loader: async () => {
    const { sites } = await loadSites()
    if (sites.length === 0) {
      return { sites, initialSiteId: null, initialOverview: null }
    }

    const initialSiteId = sites[0].id
    const initialOverview = await loadOverview({
      siteId: initialSiteId,
      range: DEFAULT_RANGE,
    })
    return { sites, initialSiteId, initialOverview }
  },
  component: OverviewRoute,
})

function OverviewRoute() {
  const { sites, initialSiteId, initialOverview } = Route.useLoaderData()
  return (
    <OverviewDashboard
      sites={sites}
      initialSiteId={initialSiteId}
      initialRange={DEFAULT_RANGE}
      initialOverview={initialOverview}
    />
  )
}
