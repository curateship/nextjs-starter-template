import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"

import { binTripById, restoreTripById } from "@/lib/api/travel/trips"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How long the Undo bar stays, as on the board. */
const UNDO_MS = 6000

/**
 * Delete on a trip moves it to the Trips table's bin, with Undo (Travel
 * features part 8; UI standard: a delete that goes to a bin with Undo
 * doesn't ask first). The Trips table and Trip settings both use this.
 */
export function useTripBin() {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getTravelErrorMessage)

  const binTrips = React.useCallback(
    async (trips: { id: string; name: string }[]) => {
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
        await router.invalidate()
      })
      if (!ok) return false
      const line =
        trips.length === 1 && done.length === 1
          ? `Moved ${trips[0].name} to the bin`
          : describeBulkResult({ done: done.length, kept: failed, one: "trip", many: "trips", verb: "moved to the bin" })
      if (failed) {
        showErrorToast(line)
        return done.length > 0
      }
      toast.success(line, {
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            void Promise.all(done.map((id) => restoreTripById(id)))
              .then(() => router.invalidate())
              .catch((error: unknown) => showErrorToast(getTravelErrorMessage(error))),
        },
      })
      return true
    },
    [router, run]
  )

  return { binTrips, busy }
}
