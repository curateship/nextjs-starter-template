import * as React from "react"
import type { GroupImperativeHandle, Layout } from "react-resizable-panels"

/**
 * Where this browser last left the dividers of a panel group, applied to the
 * group that is already on screen instead of rebuilding it.
 *
 * The shell's `useRememberedPanelLayout` hands back a `key` that changes once
 * the saved layout has been read from localStorage, and the group is built
 * again under the new key. That is fine for an editor with two text panes.
 * On the trade workspace the group holds the market list, the chart and
 * every panel, so the rebuild meant the whole screen — chart library, candle
 * request, live feeds — was set up twice on every visit.
 *
 * This version keeps the one group. The group reports its starting layout
 * the moment it registers its panels, in a layout effect before the first
 * paint. That first report is the hook's cue: it hands the saved layout to
 * the group through its `setLayout` handle and drops the report, since the
 * defaults must never be written over the memory. Every later report is a
 * real drag and is saved.
 *
 * Per mount of the GROUP, not per mount of the hook. The workspace only
 * draws its groups on a wide screen, so a group can appear later — the
 * window widened, or the wide-screen cookie was stale — and each time it
 * appears it gets the saved layout again.
 *
 * Spread `groupRef` and `onLayoutChanged` onto the group. No `key`, no
 * `defaultLayout`.
 */
export function useRememberedPanelLayoutInPlace(
  key: string,
  panelIds: readonly string[]
) {
  const handleRef = React.useRef<GroupImperativeHandle | null>(null)
  /** Whether the group on screen right now has been given the saved layout. */
  const appliedRef = React.useRef(false)

  const groupRef = React.useCallback((handle: GroupImperativeHandle | null) => {
    handleRef.current = handle
    // The group went away; the next one to attach starts over.
    if (!handle) appliedRef.current = false
  }, [])

  const onLayoutChanged = React.useCallback(
    (layout: Layout) => {
      if (!appliedRef.current) {
        appliedRef.current = true
        const saved = readSavedLayout(key, panelIds)
        // A refused layout leaves the defaults. Panel names matter as much as
        // the count: the resizing library accepts an old three-panel record
        // with one renamed panel, then crashes when it reads that panel's size.
        if (saved && handleRef.current) {
          try {
            handleRef.current.setLayout(saved)
          } catch {
            // Defaults stay.
          }
        }
        return
      }
      try {
        localStorage.setItem(key, JSON.stringify(layout))
      } catch {
        // Storage may be blocked; resizing still works for this session.
      }
    },
    [key, panelIds]
  )

  return { groupRef, onLayoutChanged }
}

function readSavedLayout(
  key: string,
  panelIds: readonly string[]
): Layout | null {
  try {
    const saved = localStorage.getItem(key)
    return saved ? matchingPanelLayout(JSON.parse(saved), panelIds) : null
  } catch {
    return null
  }
}

/** A saved layout only when it names every panel on the current screen. */
export function matchingPanelLayout(
  value: unknown,
  panelIds: readonly string[]
): Layout | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== panelIds.length) return null

  const layout: Layout = {}
  let total = 0
  for (const panelId of panelIds) {
    const size = record[panelId]
    if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
      return null
    }
    layout[panelId] = size
    total += size
  }
  return total > 0 ? layout : null
}
