import { createFileRoute, redirect } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { loadTripOnToday } from "@/lib/api/travel/trips"
import { getTravelErrorMessage } from "@/lib/travel/errors"

/**
 * `/trips/today` (Travel features 4, part 8; Tyler, 6 Nov 2026: "On sign-in
 * and Home", then "Travel-only address"): the trip that's on today, which
 * opens on today's column, or the Trips table when none is on. Set as the
 * member home route in Settings → General, it is where members land after
 * signing in and when they open Home. It only forwards, so it replaces itself
 * in the browser's history and Back never lands on it.
 */
export const Route = createFileRoute("/_authenticated/trips/today")({
  loader: async () => {
    const tripId = await loadTripOnToday()
    throw tripId
      ? redirect({ to: "/trips/$tripId", params: { tripId }, replace: true })
      : redirect({ to: "/trips", replace: true })
  },
  errorComponent: routeErrorComponent(getTravelErrorMessage),
})
