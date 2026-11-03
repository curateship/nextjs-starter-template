import * as React from "react"
import { toast } from "sonner"

import { useTrip } from "@/components/travel/trip-context"
import {
  copyTripDay,
  duplicateTripActivity,
  moveManyActivities,
  undoActivities,
  type ActivityPlace,
} from "@/lib/api/travel/days"
import { binActivityList, placeActivity, saveActivity, type Activity } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { boardColumns } from "@/lib/travel/board"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How long the Undo bar stays (task part 16: "for 6 seconds"). */
const UNDO_MS = 6000

const activities = (count: number) => (count === 1 ? "1 activity" : `${count} activities`)

/**
 * Every change to where cards are, in one place, so each one can be undone
 * (task part 16). Before a change the board writes down where every card on
 * the trip is; Undo puts them all back and removes any copies the change
 * made. The bar is the shell's toast with an Undo button.
 */
export function useBoardActions() {
  const { page, refresh, openActivity, openActivityId } = useTrip()
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const tripId = page.trip.id

  const snapshot = React.useCallback(
    (): ActivityPlace[] =>
      page.activities.map((activity) => ({
        id: activity.id,
        day: activity.day,
        position: activity.position,
        inBin: false,
      })),
    [page.activities]
  )

  /** Runs a change, reloads, then offers Undo with the line said. */
  const withUndo = React.useCallback(
    async (line: string, change: () => Promise<{ created?: string[] } | void>) => {
      const places = snapshot()
      let created: string[] = []
      const ok = await run(async () => {
        created = (await change())?.created ?? []
        await refresh()
      })
      if (!ok) return false
      toast.success(line, {
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            void undoActivities({ tripId, places, created })
              .then(() => refresh())
              .catch((error: unknown) => showErrorToast(getTravelErrorMessage(error))),
        },
      })
      return true
    },
    [refresh, run, snapshot, tripId]
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

  const dayName = (day: number | null) => (day === null ? "Ideas" : `Day ${day}`)

  return {
    busy,
    moveTo: (activity: Activity, day: number | null, order?: string[]) =>
      withUndo(`Moved to ${dayName(day)}`, () =>
        placeActivity({ activityId: activity.id, day, order: order ?? [] })
      ),
    moveMany: (ids: string[], day: number | null) =>
      withUndo(`Moved ${activities(ids.length)} to ${dayName(day)}`, () =>
        moveManyActivities(ids, day).then(() => undefined)
      ),
    remove: async (ids: string[]) => {
      const next = openActivityId && ids.includes(openActivityId) ? nextAfter(ids) : undefined
      const ok = await withUndo(
        ids.length === 1 ? "Moved to the bin" : `Moved ${activities(ids.length)} to the bin`,
        () => binActivityList(ids).then(() => undefined)
      )
      if (ok && next) openActivity(next)
      return ok
    },
    duplicate: async (activity: Activity) => {
      let id = ""
      const ok = await withUndo("Duplicated", async () => {
        id = (await duplicateTripActivity(activity.id)).id
        return { created: [id] }
      })
      if (ok) openActivity(id)
      return ok
    },
    copyDay: (from: number, to: number) =>
      withUndo(`Copied Day ${from} onto Day ${to}`, () => copyTripDay(tripId, from, to)),
    /** Done is a plain field change: no Undo, just saved. */
    setField: (activity: Activity, patch: { done?: boolean }) =>
      run(async () => {
        await saveActivity({ activityId: activity.id, ...patch })
        await refresh()
      }),
  }
}

export type BoardActions = ReturnType<typeof useBoardActions>
