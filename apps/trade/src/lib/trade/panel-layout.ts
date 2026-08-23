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
export function useRememberedPanelLayoutInPlace(key: string) {
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
        const saved = readSavedLayout(key)
        // The library throws on a layout whose panel count does not match,
        // and applies by position otherwise. A refused layout leaves the
        // defaults, which is what the shell hook did too.
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
    [key]
  )

  return { groupRef, onLayoutChanged }
}

function readSavedLayout(key: string): Layout | null {
  try {
    const saved = localStorage.getItem(key)
    return saved ? (JSON.parse(saved) as Layout) : null
  } catch {
    return null
  }
}
