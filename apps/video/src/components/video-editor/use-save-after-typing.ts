import * as React from "react"

/**
 * A save that waits for typing to pause, for the Settings tabs that save
 * themselves with no button.
 *
 * Leaving the tab sends a save still waiting on its timer, so the last thing
 * typed is never dropped. Settings → Captions works the same way.
 */
export function useSaveAfterTyping(delayMs: number) {
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const waiting = React.useRef<(() => void) | null>(null)

  const cancel = React.useCallback(() => {
    clearTimeout(timer.current)
    waiting.current = null
  }, [])

  /** Saves after `delayMs`, replacing any save still waiting. */
  const later = React.useCallback(
    (save: () => void) => {
      clearTimeout(timer.current)
      const run = () => {
        waiting.current = null
        save()
      }
      waiting.current = run
      timer.current = setTimeout(run, delayMs)
    },
    [delayMs]
  )

  React.useEffect(
    () => () => {
      clearTimeout(timer.current)
      waiting.current?.()
    },
    []
  )

  return { later, cancel }
}
