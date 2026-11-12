import * as React from "react"

import { useTrip } from "@/components/travel/trip-context"
import {
  copyTripDay,
  duplicateTripActivity,
  moveManyActivities,
  orderTripDay,
} from "@/lib/api/travel/days"
import { binActivityList, markActivityListDone, placeActivity, saveActivity, type Activity } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { boardColumns } from "@/lib/travel/board"
import { getTravelErrorMessage } from "@/lib/travel/errors"

/**
 * Every change to where cards are, in one place. Nothing pops up when one
 * works: the board redraws with the cards where they went (Tyler, 11 Nov 2026:
 * the success toasts go, Undo bars included).
 */
export function useBoardActions() {
  const { page, refresh, openActivity, openActivityId } = useTrip()
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const tripId = page.trip.id

  /** Runs a change to where cards are, then reads the trip again. */
  const apply = React.useCallback(
    (change: () => Promise<unknown>) =>
      run(async () => {
        await change()
        await refresh()
      }),
    [refresh, run]
  )

  /** The card after this one on the board, to open once it goes, so the right panel is never left empty. */
  const nextAfter = React.useCallback(
    (ids: string[]) => {
      const order = [...boardColumns(page.trip.days, page.activities).values()].flat().map((activity) => activity.id)
      const at = Math.max(...ids.map((id) => order.indexOf(id)))
      return order.slice(at + 1).find((id) => !ids.includes(id)) ?? order.find((id) => !ids.includes(id))
    },
    [page.activities, page.trip.days]
  )

  return {
    busy,
    moveTo: (activity: Activity, day: number | null, order?: string[]) =>
      apply(() => placeActivity({ activityId: activity.id, day, order: order ?? [] })),
    moveMany: (ids: string[], day: number | null) =>
      apply(() => moveManyActivities(ids, day)),
    remove: async (ids: string[]) => {
      const next = openActivityId && ids.includes(openActivityId) ? nextAfter(ids) : undefined
      const ok = await apply(() => binActivityList(ids))
      if (ok && next) openActivity(next)
      return ok
    },
    duplicate: async (activity: Activity) => {
      let id = ""
      const ok = await apply(async () => {
        id = (await duplicateTripActivity(activity.id)).id
      })
      if (ok) openActivity(id)
      return ok
    },
    copyDay: (from: number, to: number) =>
      apply(() => copyTripDay(tripId, from, to)),
    /** Best order for a day (Travel features part 5). */
    bestOrder: (day: number) => apply(() => orderTripDay(tripId, day)),
    /** Mass select's Mark done or not done: one request, the same as the single tick. */
    markDone: async (ids: string[], done: boolean) => {
      return run(async () => {
        await markActivityListDone(ids, done)
        await refresh()
      })
    },
    /** Done and Must do are plain field changes, just saved. */
    setField: (activity: Activity, patch: { done?: boolean; mustDo?: boolean }) =>
      run(async () => {
        await saveActivity({ activityId: activity.id, ...patch })
        await refresh()
      }),
  }
}

export type BoardActions = ReturnType<typeof useBoardActions>
