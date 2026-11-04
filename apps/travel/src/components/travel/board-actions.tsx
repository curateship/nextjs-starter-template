import * as React from "react"
import { toast } from "sonner"

import { useTrip } from "@/components/travel/trip-context"
import {
  copyTripDay,
  duplicateTripActivity,
  moveManyActivities,
  orderTripDay,
  undoActivities,
  type ActivityPlace,
  type BestOrderResult,
} from "@/lib/api/travel/days"
import { binActivityList, markActivityListDone, placeActivity, saveActivity, type Activity } from "@/lib/api/travel/trips"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { boardColumns, formatMinutes } from "@/lib/travel/board"
import type { TravelMode } from "@/lib/travel/rules"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How long the Undo bar stays (task part 16: "for 6 seconds"). */
const UNDO_MS = 6000

const activities = (count: number) => (count === 1 ? "1 activity" : `${count} activities`)

const GETTING_ABOUT: Record<TravelMode, string> = { walk: "walking", transit: "on transit", drive: "driving" }

/** What Best order says it did, such as "Day 2 in its best order: saves 25m of walking." */
function bestOrderLine(day: number, result: BestOrderResult, mode: TravelMode) {
  if (result.ordered < 2) {
    return { line: `Day ${day} needs two or more untimed activities with a place from Google to order.`, unchanged: true }
  }
  if (result.savedMinutes === 0) return { line: `Day ${day} is already in its best order.`, unchanged: true }
  if (result.savedMinutes === null) {
    return { line: `Put Day ${day} in order. Google found no route between some of its places, so the time saved isn't known.` }
  }
  return { line: `Day ${day} in its best order: saves ${formatMinutes(result.savedMinutes)} of ${GETTING_ABOUT[mode]}.` }
}

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
        startTime: activity.startTime,
        dayPart: activity.dayPart,
      })),
    [page.activities]
  )

  /**
   * Runs a change, reloads, then offers Undo with the line said. A change may
   * say its own line, from what it did, and may say there's nothing to undo.
   */
  const withUndo = React.useCallback(
    async (
      line: string,
      change: () => Promise<{ created?: string[]; line?: string; unchanged?: boolean } | void>
    ) => {
      const places = snapshot()
      let created: string[] = []
      let said = line
      let unchanged = false
      const ok = await run(async () => {
        const result = await change()
        created = result?.created ?? []
        said = result?.line ?? line
        unchanged = result?.unchanged ?? false
        await refresh()
      })
      if (!ok) return false
      if (unchanged) {
        toast.success(said)
        return true
      }
      toast.success(said, {
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
    /** Best order for a day (Travel features part 5), with Undo when it moved anything. */
    bestOrder: (day: number) =>
      withUndo(`Put Day ${day} in its best order`, async () => {
        const result = await orderTripDay(tripId, day)
        return bestOrderLine(day, result, page.trip.travelMode)
      }),
    /** Mass select's Mark done or not done: one request, no Undo, the same as the single tick. */
    markDone: async (ids: string[], done: boolean) => {
      let line = ""
      const ok = await run(async () => {
        const result = await markActivityListDone(ids, done)
        await refresh()
        // Cards gone from the trip since they were ticked are counted apart, never reported as changed.
        line = describeBulkResult({
          done: result.changed,
          kept: result.skipped,
          one: "activity",
          many: "activities",
          verb: done ? "marked done" : "marked not done",
          keptReason: "no longer on the trip",
        })
      })
      if (ok) toast.success(line)
      return ok
    },
    /** Done and Must do are plain field changes: no Undo, just saved. */
    setField: (activity: Activity, patch: { done?: boolean; mustDo?: boolean }) =>
      run(async () => {
        await saveActivity({ activityId: activity.id, ...patch })
        await refresh()
      }),
  }
}

export type BoardActions = ReturnType<typeof useBoardActions>
