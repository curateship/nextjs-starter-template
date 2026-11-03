import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { TripWorkspace } from "@/components/travel/trip-workspace"
import { loadTrip } from "@/lib/api/travel/trips"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { pageTitleHead } from "@/lib/travel/page-title"
import { readTripSearch, type TripSearch } from "@/lib/travel/trip-search"

/** One trip: details, the days as a board, and the open activity, side by side. */
export const Route = createFileRoute("/_authenticated/trips/$tripId")({
  validateSearch: readTripSearch,
  // Opening an activity or switching the view must not reload the trip under it.
  loaderDeps: () => ({}),
  loader: ({ params }) => loadTrip(params.tripId),
  head: ({ loaderData, matches }) => pageTitleHead(loaderData?.trip.name ?? "Trip", matches),
  component: TripRoute,
  errorComponent: routeErrorComponent(getTravelErrorMessage),
})

function TripRoute() {
  const page = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const onSearch = React.useCallback(
    (patch: Partial<TripSearch>, { history = false }: { history?: boolean } = {}) =>
      void navigate({
        replace: !history,
        search: (previous) => {
          const next: Record<string, unknown> = { ...previous, ...patch }
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
          return next as TripSearch
        },
      }),
    [navigate]
  )
  return <TripWorkspace key={page.trip.id} page={page} search={search} onSearch={onSearch} />
}
