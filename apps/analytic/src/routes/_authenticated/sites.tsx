import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"

import { SitesDashboard } from "@/components/sites-dashboard"
import { loadSites } from "@/lib/api/sites"

export const Route = createFileRoute("/_authenticated/sites")({
  loader: () => loadSites(),
  component: SitesRoute,
})

function SitesRoute() {
  const { sites } = Route.useLoaderData()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  // Child detail routes (/sites/:id) render through the outlet.
  if (pathname.startsWith("/sites/")) {
    return <Outlet />
  }

  return <SitesDashboard initialSites={sites} />
}
