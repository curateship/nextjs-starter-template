import * as React from "react"

const TICK_MS = 30_000

/**
 * The moment a screen draws, in milliseconds: the page load's own moment
 * first, so the server's drawing and the browser's agree, then the browser's
 * clock every 30 seconds. The Daily card and Meetings today read it.
 */
export function useNow(loadedAt: string) {
  const [now, setNow] = React.useState(() => Date.parse(loadedAt))
  React.useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0)
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [])
  return now
}
