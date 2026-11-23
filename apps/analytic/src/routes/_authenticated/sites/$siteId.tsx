import { createFileRoute } from "@tanstack/react-router"

import { SiteSetup } from "@/components/site-setup"
import { loadSiteDetail } from "@/lib/api/sites"

export const Route = createFileRoute("/_authenticated/sites/$siteId")({
  loader: ({ params }) => loadSiteDetail(params.siteId),
  component: SiteDetailRoute,
})

function SiteDetailRoute() {
  const detail = Route.useLoaderData()
  return <SiteSetup detail={detail} />
}
