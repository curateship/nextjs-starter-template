import * as React from "react"

import type { WidgetBoard, WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { getAdminErrorMessage, loadOverviewWidgets, saveOverviewWidgets } from "@/lib/api/admin-dashboard"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Where an app's own grid reads and saves its layout, in place of a board's
 * site-wide one: Trade keeps one per account (8 Nov 2026). `save` answers
 * with the layout as stored. `message` turns a failure into words.
 */
export type WidgetStore = {
  load: () => Promise<WidgetLayout>
  save: (layout: WidgetLayout) => Promise<WidgetLayout>
  message: (error: unknown) => string
}

const boardStores: Record<WidgetBoard, WidgetStore> = {
  admin: {
    load: () => loadOverviewWidgets("admin"),
    save: (layout) => saveOverviewWidgets("admin", layout),
    message: getAdminErrorMessage,
  },
  crm: {
    load: () => loadOverviewWidgets("crm"),
    save: (layout) => saveOverviewWidgets("crm", layout),
    message: getAdminErrorMessage,
  },
}

/**
 * An Overview's widget layout (`board`: the Admin dashboard's or the CRM's,
 * or an app's own `WidgetStore`),
 * held by the whole dashboard: the left ⋮'s
 * Widgets tab sets it on every section, and Overview's widgets change it from
 * their own ⋮ and from an empty spot.
 *
 * - `seed` is the layout the route read with Overview. Arriving on another
 *   section, it is read here instead.
 * - A change shows at once and saves in turn: each is written after the one
 *   before it, so the database ends on the last change even when two are sent
 *   close together. A save that fails puts back the layout last stored.
 */
export function useWidgetLayout(source: WidgetBoard | WidgetStore, seed: WidgetLayout | null) {
  // A store is held by the latest render's, so a caller may build it inline.
  const store = React.useRef<WidgetStore>(typeof source === "string" ? boardStores[source] : source)
  React.useEffect(() => {
    store.current = typeof source === "string" ? boardStores[source] : source
  })
  const board = typeof source === "string" ? source : null
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
    store.current
      .load()
      .then((read) => {
        if (!active) return
        stored.current = read
        setLayout(read)
        setError(null)
      })
      .catch((readError) => {
        if (active) setError(store.current.message(readError))
      })
    return () => {
      active = false
    }
  }, [board, layout, attempt])

  const change = React.useCallback((next: WidgetLayout) => {
    const request = ++latest.current
    setLayout(next)
    queue.current = queue.current.then(async () => {
      try {
        stored.current = await store.current.save(next)
        if (request === latest.current) setLayout(stored.current)
      } catch (saveError) {
        if (request === latest.current) setLayout(stored.current)
        showErrorToast(store.current.message(saveError))
      }
    })
  }, [])

  return { board, layout, error, retry: () => setAttempt((count) => count + 1), change }
}
