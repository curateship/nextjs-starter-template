import * as React from "react"

/** Runs background refreshes only while the browser tab is visible. */
export function useVisibleInterval(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled = true
) {
  const callbackRef = React.useRef(callback)
  React.useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  React.useEffect(() => {
    if (!enabled) return
    let running = false

    async function tick() {
      if (running || document.visibilityState !== "visible") return
      running = true
      try {
        await callbackRef.current()
      } catch {
        // Polling is best effort; the next visible tick retries.
      } finally {
        running = false
      }
    }

    const timer = window.setInterval(() => void tick(), intervalMs)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void tick()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [enabled, intervalMs])
}
