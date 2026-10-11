import * as React from "react"

import { getProjectErrorMessage } from "@/lib/project/errors"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

export type SaveState = "saving" | "saved" | "failed" | null

/**
 * The one sign for a field that saves itself: Saving…, then Saved or Not
 * saved, beside the field. `track` runs the save, and a failure also goes to
 * the error toast with the reason. It returns true when the save went through.
 */
export function useSaveLine() {
  const [state, setState] = React.useState<SaveState>(null)
  const track = React.useCallback(async (work: () => Promise<unknown>) => {
    dismissErrorToast()
    setState("saving")
    try {
      await work()
      setState("saved")
      return true
    } catch (error) {
      setState("failed")
      showErrorToast(getProjectErrorMessage(error))
      return false
    }
  }, [])
  return [state, track] as const
}
