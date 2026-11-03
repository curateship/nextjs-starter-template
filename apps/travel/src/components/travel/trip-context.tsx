import * as React from "react"

import type { Activity, TripPage } from "@/lib/api/travel/trips"
import type { ActivityType } from "@/lib/travel/activity-types"

/**
 * The trip page's data and the few things every panel does with it: reload
 * after a change, and open an activity in the right panel. One context, so
 * each card and field doesn't need them handed down through every layer.
 */
export type TripContextValue = {
  page: TripPage
  typesById: ReadonlyMap<string, ActivityType>
  /** Reloads the trip after a change was saved. */
  refresh: () => Promise<void>
  openActivity: (activityId: string) => void
  openActivityId: string | undefined
}

const TripContext = React.createContext<TripContextValue | null>(null)

export function TripProvider({ value, children }: { value: TripContextValue; children: React.ReactNode }) {
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}

export function useTrip() {
  const value = React.useContext(TripContext)
  if (!value) throw new Error("useTrip is used outside the trip page.")
  return value
}

export function typeOf(activity: Pick<Activity, "typeId">, typesById: ReadonlyMap<string, ActivityType>) {
  return activity.typeId ? (typesById.get(activity.typeId) ?? null) : null
}

// The activity a person just clicked open, so its notes take the cursor
// (task "Misc": "Have the label write something and flashing bar on card
// open"). One opened by itself on arrival leaves the cursor where it was.
let clickedOpen: string | null = null

export function markClickedOpen(activityId: string) {
  clickedOpen = activityId
}

/** True once for the activity just clicked open. */
export function takeClickedOpen(activityId: string) {
  const was = clickedOpen === activityId
  if (was) clickedOpen = null
  return was
}
