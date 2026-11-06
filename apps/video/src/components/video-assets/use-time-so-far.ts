import * as React from "react"

/**
 * The time now, read once a second while `active`, and null before the first
 * reading. Still otherwise, so a screen with nothing running never redraws on
 * a timer. The clock is only read inside the timer, never while drawing.
 */
export function useNow(active: boolean) {
  const [now, setNow] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [active])
  return active ? now : null
}

/** How long, in milliseconds, `running` has been true. Null while it is not. */
export function useRunningFor(running: boolean) {
  const [ms, setMs] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (!running) return
    const since = Date.now()
    const tick = () => setMs(Date.now() - since)
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [running])
  return running ? ms : null
}
