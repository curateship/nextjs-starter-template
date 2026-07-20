import type * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

/** Which edge of a workspace a collapse toggle controls. */
export type PanelSide = "left" | "right" | "bottom"

/**
 * Collapse a resizable panel, or expand it when it is already collapsed.
 *
 * `expandTo` is the panel's default size (e.g. `"16%"`). A panel that was
 * already collapsed when the page loaded has no remembered width, so the
 * library reopens it at its minimum — a useless sliver. Expanding therefore
 * never gives back less than the default.
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
  if (expandTo && panel.getSize().asPercentage < Number.parseFloat(expandTo)) {
    panel.resize(expandTo)
  }
}
