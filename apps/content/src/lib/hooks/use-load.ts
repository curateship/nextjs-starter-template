import * as React from "react"

import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

/** The reads kept under a `remember` name, for this tab. */
const remembered = new Map<string, unknown>()

/** What `remember` kept under a name, for a caller seeding its own state. */
export function rememberedLoad<T>(name: string): T | null {
  return (remembered.get(name) as T | undefined) ?? null
}

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
 *
 * `remember` names a read worth keeping between visits, such as a
 * dashboard's left page. The last reply, and every `setData` after it, is
 * kept in memory under that name, and the next time the component appears it
 * starts from that copy and reads again behind it. Moving between Admin and
 * the CRM then draws the page, its cover and its counts at once instead of
 * an empty header for a moment (Tyler, 9 Nov 2026: "clicking through the
 * dashboards kept loading the top header and its background. It should load
 * instantly"). The copy lives in this tab's memory only. Switching sites
 * reloads the whole page (`use-switch-workspace.ts`), which empties it, so
 * one site's copy is never shown on another.
 */
export function useLoad<T>(
  load: () => Promise<T>,
  describeError: (error: unknown) => string,
  options: {
    keys?: React.DependencyList
    onLoad?: (value: T) => void
    remember?: string
  } = {}
) {
  const remember = options.remember
  const [data, setData] = React.useState<T | null>(() =>
    remember ? rememberedLoad<T>(remember) : null
  )
  React.useEffect(() => {
    if (remember && data !== null) remembered.set(remember, data)
  }, [remember, data])
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
