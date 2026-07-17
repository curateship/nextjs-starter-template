import { createFileRoute } from "@tanstack/react-router"

import { AudienceDashboard } from "@/components/audience-dashboard"
import { loadAudience } from "@/lib/api/audience"
import type { OverviewRange } from "@/lib/api/overview"
import { loadSites } from "@/lib/api/sites"

const DEFAULT_RANGE: OverviewRange = "7d"

export const Route = createFileRoute("/_authenticated/audience")({
  loader: async () => {
    const { sites } = await loadSites()
    if (sites.length === 0) {
      return { sites, initialSiteId: null, initialAudience: null }
    }

    const initialSiteId = sites[0].id
    const initialAudience = await loadAudience({
      siteId: initialSiteId,
      range: DEFAULT_RANGE,
    })
    return { sites, initialSiteId, initialAudience }
  },
  component: AudienceRoute,
})

function AudienceRoute() {
  const { sites, initialSiteId, initialAudience } = Route.useLoaderData()
  return (
    <AudienceDashboard
      sites={sites}
      initialSiteId={initialSiteId}
      initialRange={DEFAULT_RANGE}
      initialAudience={initialAudience}
    />
  )
}
