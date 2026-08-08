import * as React from "react"
import { toast } from "sonner"

import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * The shape every button that calls the server takes: clear the last failure,
 * mark itself busy, do the work, say so if it worked, show the failure as a
 * toast if it did not, and stop being busy either way.
 *
 * `describeError` is the feature's own `getXErrorMessage`, so a failure is
 * still reported in that feature's words.
 *
 *     const [run, busy] = useAsyncAction(getPlanErrorMessage)
 *     …
 *     onClick={() => run(() => archivePlan(id), "Plan archived.")}
 *
 * `run` returns true when the work succeeded, for the callers that need to
 * close a dialog only on success.
 */
export function useAsyncAction(describeError: (error: unknown) => string) {
  const [busy, setBusy] = React.useState(false)

  const run = React.useCallback(
    async (work: () => Promise<unknown>, successText?: string) => {
      dismissErrorToast()
      setBusy(true)
      try {
        await work()
        if (successText) toast.success(successText)
        return true
      } catch (error) {
        showErrorToast(describeError(error))
        return false
      } finally {
        setBusy(false)
      }
    },
    [describeError]
  )

  return [run, busy] as const
}
