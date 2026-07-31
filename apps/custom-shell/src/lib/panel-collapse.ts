import type * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

/**
 * Collapse a resizable panel, or expand it when it is already collapsed.
 *
 * `expandTo` is the panel's default size (e.g. `"22%"`), and expanding always
 * returns the panel to exactly that. Left to itself the library restores
 * whatever size the panel last had — the minimum (a useless sliver) for a
 * panel that was already collapsed on load, or a stale hand-dragged size that
 * squeezes the workspace the moment you reopen it. Reopening is a fresh start,
 * so panels come back the same predictable size every time.
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
