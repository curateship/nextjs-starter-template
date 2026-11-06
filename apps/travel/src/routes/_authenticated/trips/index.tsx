import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { TripsDashboard, type TripsShow } from "@/components/travel/trips-dashboard"
import { loadTrips } from "@/lib/api/travel/trips"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { pageTitleHead } from "@/lib/travel/page-title"

type TripsSearch = {
  /** Past, Archived, Bin or Year; Upcoming when absent (task part 36, Travel features part 8, Travel features 4 part 9). */
  show?: Exclude<TripsShow, "upcoming">
}

function readTripsSearch(search: Record<string, unknown>): TripsSearch {
  return search.show === "past" || search.show === "archived" || search.show === "bin" || search.show === "year"
    ? { show: search.show }
    : {}
}

/** The Trips table: every trip of the person signed in. */
export const Route = createFileRoute("/_authenticated/trips/")({
  validateSearch: readTripsSearch,
  loader: () => loadTrips(),
  head: ({ matches }) => pageTitleHead("Trips", matches),
  component: TripsRoute,
  errorComponent: routeErrorComponent(getTravelErrorMessage),
})

function TripsRoute() {
  const { show } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <TripsDashboard
      page={Route.useLoaderData()}
      show={show ?? "upcoming"}
      onShow={(next) => void navigate({ search: next === "upcoming" ? {} : { show: next }, replace: true })}
    />
  )
}
