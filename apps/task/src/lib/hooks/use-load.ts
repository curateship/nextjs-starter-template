import * as React from "react"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

/**
 * Load something once a component appears, and again whenever `keys` change or
 * someone presses Try again.
 *
 * Every card that fetched its own data wrote the same eighteen lines: a
 * `cancelled` flag so a reply that lands after the card closed is thrown away,
 * a counter that Try again bumps, and an error line in the feature's own words.
 * This is those lines, once.
 *
 *     const segments = useLoad(loadSegmentChoices, getSegmentLoadErrorMessage)
 *     segments.data   // null until the first reply
 *     segments.error  // the feature's own message, or null
 *     segments.retry  // what Try again calls
 *
 * `load` and `onLoad` may be written inline: the latest ones are always used,
 * and changing them does not reload. Only `keys` and `retry` reload, so a load
 * that depends on a prop puts that prop in `keys`.
 *
 * `onLoad` runs with each reply before `data` changes, for a card that also
 * seeds its own drafts from what arrived.
 *
 * A failed reload keeps the last good `data` on screen beside the error, the
 * way the hand-written cards did.
 */
export function useLoad<T>(
  load: () => Promise<T>,
  describeError: (error: unknown) => string,
  options: {
    keys?: React.DependencyList
    onLoad?: (value: T) => void
  } = {}
) {
  const [data, setData] = React.useState<T | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  const latest = React.useRef({ load, describeError, onLoad: options.onLoad })
  useEffectBeforePaint(() => {
    latest.current = { load, describeError, onLoad: options.onLoad }
  })

  const keys = options.keys ?? []
  React.useEffect(() => {
    let cancelled = false
    latest.current
      .load()
      .then((value) => {
        if (cancelled) return
        latest.current.onLoad?.(value)
        setData(value)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(latest.current.describeError(reason))
      })
    return () => {
      cancelled = true
    }
    // `keys` is the caller's own list, spread on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...keys])

  const retry = React.useCallback(() => {
    setError(null)
    setAttempt((count) => count + 1)
  }, [])

  return { data, error, retry, setData }
}
