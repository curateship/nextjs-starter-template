/* eslint-disable react-refresh/only-export-components */
import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router"

import { GoogleMapsDashboard } from "@/scrapers/google-maps/dashboard"

export const Route = createFileRoute("/_authenticated/admin/scrapers/google-maps")({
  component: GoogleMapsRoute,
})

function GoogleMapsRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname !== "/admin/scrapers/google-maps") {
    return <Outlet />
  }

  return <GoogleMapsDashboard />
}
