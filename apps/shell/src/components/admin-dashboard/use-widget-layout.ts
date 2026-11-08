import * as React from "react"

import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { getAdminErrorMessage, loadOverviewWidgets, saveOverviewWidgets } from "@/lib/api/admin-dashboard"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Overview's widget layout, held by the whole dashboard: the left ⋮'s
 * Widgets tab sets it on every section, and Overview's widgets change it from
 * their own ⋮ and from an empty spot.
 *
 * - `seed` is the layout the route read with Overview. Arriving on another
 *   section, it is read here instead.
 * - A change shows at once and saves in turn: each is written after the one
 *   before it, so the database ends on the last change even when two are sent
 *   close together. A save that fails puts back the layout last stored.
 */
export function useWidgetLayout(seed: WidgetLayout | null) {
  const [layout, setLayout] = React.useState<WidgetLayout | null>(seed)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const stored = React.useRef<WidgetLayout | null>(seed)
  const queue = React.useRef<Promise<void>>(Promise.resolve())
  const latest = React.useRef(0)

  // The route read it when Overview opened after another section.
  if (layout === null && seed) setLayout(seed)
  React.useEffect(() => {
    if (seed && stored.current === null) stored.current = seed
  }, [seed])

  React.useEffect(() => {
    if (layout) return
    let active = true
    loadOverviewWidgets()
      .then((read) => {
        if (!active) return
        stored.current = read
        setLayout(read)
        setError(null)
      })
      .catch((readError) => {
        if (active) setError(getAdminErrorMessage(readError))
      })
    return () => {
      active = false
    }
  }, [layout, attempt])

  const change = React.useCallback((next: WidgetLayout) => {
    const request = ++latest.current
    setLayout(next)
    queue.current = queue.current.then(async () => {
      try {
        stored.current = await saveOverviewWidgets(next)
        if (request === latest.current) setLayout(stored.current)
      } catch (saveError) {
        if (request === latest.current) setLayout(stored.current)
        showErrorToast(getAdminErrorMessage(saveError))
      }
    })
  }, [])

  return { layout, error, retry: () => setAttempt((count) => count + 1), change }
}
