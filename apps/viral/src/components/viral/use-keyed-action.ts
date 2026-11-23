import * as React from "react"

import { useAsyncAction } from "@/lib/hooks/use-async-action"

/**
 * `useAsyncAction` with one busy mark per button instead of one for the whole
 * screen. Each action names itself with a key, such as `keyword:<id>`, and
 * only the buttons asking about that key grey out while it runs. A search
 * running on one keyword then leaves Break it down, Follow and every other
 * keyword pressable, as the player panel's buttons already were.
 */
export function useKeyedAction(describeError: (error: unknown) => string) {
  const [runAction] = useAsyncAction(describeError)
  const [busyKeys, setBusyKeys] = React.useState<ReadonlySet<string>>(
    () => new Set()
  )

  const run = React.useCallback(
    async (key: string, work: () => Promise<unknown>) => {
      setBusyKeys((keys) => new Set(keys).add(key))
      try {
        return await runAction(work)
      } finally {
        setBusyKeys((keys) => {
          const next = new Set(keys)
          next.delete(key)
          return next
        })
      }
    },
    [runAction]
  )

  const isBusy = React.useCallback(
    (key: string) => busyKeys.has(key),
    [busyKeys]
  )

  return { run, isBusy }
}
