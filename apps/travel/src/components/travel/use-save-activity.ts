import * as React from "react"

import { useTrip } from "@/components/travel/trip-context"
import { saveActivity } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import type { UpdateActivityInput } from "@/lib/travel/schemas"

/** Saves one change to the open activity, then reloads the trip. False when it was refused. */
export function useSaveActivity(activityId: string) {
  const { refresh } = useTrip()
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const save = React.useCallback(
    (patch: Omit<UpdateActivityInput, "activityId">) =>
      run(async () => {
        await saveActivity({ activityId, ...patch })
        await refresh()
      }),
    [activityId, refresh, run]
  )
  return [save, busy] as const
}

