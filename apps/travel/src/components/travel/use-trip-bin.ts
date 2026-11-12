import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { binTripById } from "@/lib/api/travel/trips"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Delete on a trip moves it to the Trips table's bin (Travel features part 8),
 * where it can be brought back, so it does not ask first. The Trips table and
 * Trip settings both use this.
 */
export function useTripBin() {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getTravelErrorMessage)

  const binTrips = React.useCallback(
    async (
      trips: { id: string; name: string }[],
      // Left off when the page is about to leave anyway: reloading a trip page whose trip has just
      // gone to the bin asks for a trip it can no longer see (Delete trip, on the trip page).
      { reload = true }: { reload?: boolean } = {}
    ) => {
      const done: string[] = []
      let failed = 0
      const ok = await run(async () => {
        for (const trip of trips) {
          try {
            await binTripById(trip.id)
            done.push(trip.id)
          } catch {
            failed += 1
          }
        }
        if (reload) await router.invalidate()
      })
      if (!ok) return false
      // Nothing pops up when every trip went. The ones that did not are said.
      if (failed) {
        showErrorToast(
          describeBulkResult({ done: done.length, kept: failed, one: "trip", many: "trips", verb: "moved to the bin" })
        )
        return done.length > 0
      }
      return true
    },
    [router, run]
  )

  return { binTrips, busy }
}
