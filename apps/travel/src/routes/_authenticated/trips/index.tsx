import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { TripsDashboard } from "@/components/travel/trips-dashboard"
import { loadTrips } from "@/lib/api/travel/trips"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { pageTitleHead } from "@/lib/travel/page-title"
import { readTripsSearch } from "@/lib/travel/trips-search"

/**
 * The Trips dashboard: Overview, Trips and Places in one three-panel frame
 * (Tyler, 12 Nov 2026). The section, tab, filters and open record live in
 * the address (`TripsSearch`).
 */
export const Route = createFileRoute("/_authenticated/trips/")({
  validateSearch: readTripsSearch,
  // Picking a tab, a section or a row must not read every trip again.
  loaderDeps: () => ({}),
  loader: () => loadTrips(),
  head: ({ matches }) => pageTitleHead("Trips", matches),
  component: TripsRoute,
  errorComponent: routeErrorComponent(getTravelErrorMessage),
})

function TripsRoute() {
  return <TripsDashboard page={Route.useLoaderData()} search={Route.useSearch()} />
}
