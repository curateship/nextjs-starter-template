import * as React from "react"

/**
 * Polls a server fn on an interval. State updates only happen after awaits,
 * so this stays within the hooks lint rules.
 */
export function useIntervalLoader<T>(
  fetcher: () => Promise<T>,
  initial: T,
  intervalMs = 5_000
) {
  const [data, setData] = React.useState<T>(initial)
  const fetcherRef = React.useRef(fetcher)
  React.useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

  const refresh = React.useCallback(async () => {
    try {
      const next = await fetcherRef.current()
      setData(next)
    } catch {
      // Poll again next tick; transient errors shouldn't clear the view.
    }
  }, [])

  React.useEffect(() => {
    const timer = setInterval(() => void refresh(), intervalMs)
    return () => clearInterval(timer)
  }, [refresh, intervalMs])

  return { data, refresh }
}
