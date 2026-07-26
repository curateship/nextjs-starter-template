import type * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

/** Which edge of a workspace a collapse toggle controls. */
export type PanelSide = "left" | "right" | "bottom"

/**
 * Collapse a resizable panel, or expand it when it is already collapsed.
 *
 * `expandTo` is the panel's default size (e.g. `"16%"`), and expanding always
 * returns the panel to exactly that. Left to itself the library restores
 * whatever width the panel last had — the minimum (a useless sliver) for a
 * panel that was already collapsed on load, or a stale hand-dragged width that
 * squeezes the chart the moment you reopen it. Reopening is a fresh start, so
 * every workspace's panels come back the same predictable size.
 */
export function togglePanel(
  ref: React.RefObject<PanelImperativeHandle | null>,
  expandTo?: string
) {
  const panel = ref.current
  if (!panel) return
  if (!panel.isCollapsed()) {
    panel.collapse()
    return
  }
  panel.expand()
  if (expandTo) panel.resize(expandTo)
}
