import * as React from "react"
import type {
  Layout,
  LayoutChangedMeta,
  PanelImperativeHandle,
} from "react-resizable-panels"

/**
 * The most of the workspace the bottom panel may ever take by growing. The
 * chart always keeps the other half, so a table with three hundred rows fills
 * half the screen and scrolls inside itself rather than pushing the chart out.
 */
const CAP_PERCENT = 50

/**
 * How tall the panel should be, as a percentage of its group, to show `hidden`
 * more pixels of rows than it shows now.
 *
 * `null` means leave it exactly where it is: there is nothing hidden, the panel
 * has not been measured yet, or it is already at or past the cap.
 *
 * Growing only ever gets bigger. A tab with two rows in it does not pull the
 * divider up past the height the divider was dragged to.
 */
export function fitPercent({
  hidden,
  sizePx,
  sizePercent,
  capPercent = CAP_PERCENT,
}: {
  /** Pixels of content the panel is holding but not showing. */
  hidden: number
  /** How tall the panel is right now. */
  sizePx: number
  /** That same height as a share of its panel group, 0 to 100. */
  sizePercent: number
  capPercent?: number
}): number | null {
  if (hidden <= 0 || sizePx < 1 || sizePercent <= 0) return null
  const perPixel = sizePercent / sizePx
  const wanted = Math.min(sizePercent + hidden * perPixel, capPercent)
  // Under a twentieth of a percent is a rounding difference, not a row.
  if (wanted <= sizePercent + 0.05) return null
  return wanted
}

/**
 * What pressing a tab does to the height of the panel the tab sits in.
 *
 * The panel it belongs to knows how tall its rows are; the workspace above it
 * owns the resizable panel and is the only thing allowed to set a height. So
 * the workspace hands these two moves down and the panel calls them.
 */
export type PanelFit = {
  /**
   * Grow so `hidden` more pixels of content fit, up to half the workspace.
   * A panel shut down to its own header opens instead, to the height the
   * divider was left at.
   */
  grow: (hidden: number) => void
  /** Back to the height the divider was last dragged to. */
  shrink: () => void
  /**
   * The panel is showing a grown height rather than the dragged one.
   *
   * What pressing a tab does depends on it: the same tab pressed twice grows
   * and then shrinks, so something has to know which of the two this press is.
   */
  grown: () => boolean
}

/**
 * Growing a resizable panel to fit what is in it, through the same panel the
 * divider drags, so there is one thing setting the height and not two fighting
 * over it.
 *
 * The grown height is never remembered. `onLayoutChanged` goes onto the panel
 * group in place of the remembered layout's own, and it drops exactly one kind
 * of change on the floor: a size this hook asked for. A drag, a collapse and
 * every other layout change are saved as they always were, so the next visit
 * opens on the height the divider was left at rather than on the cap.
 */
export function usePanelFit(
  panelRef: React.RefObject<PanelImperativeHandle | null>,
  save: (layout: Layout) => void
): PanelFit & {
  onLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void
} {
  // The height the divider was left at, captured the moment before growing.
  // Null means the panel is showing that dragged height already, which is also
  // how "grown" is told apart from "not grown".
  const draggedPercent = React.useRef<number | null>(null)

  const grow = React.useCallback(
    (hidden: number) => {
      const panel = panelRef.current
      if (!panel) return
      // **A shut panel opens; it never grows from where it is.** Opening is
      // what somebody pressing the tab of a shut panel is asking for, and the
      // panel already knows the height to open on. Growing from shut instead
      // would leave nothing to give back afterwards, and the panel library
      // learns its reopen height from whatever size it was shut at — so a
      // panel shut while grown would reopen on the grown height, and then save
      // it. That is the one thing the grown height must never become.
      if (panel.isCollapsed()) {
        panel.expand()
        return
      }
      const { asPercentage, inPixels } = panel.getSize()
      const wanted = fitPercent({
        hidden,
        sizePx: inPixels,
        sizePercent: asPercentage,
      })
      if (wanted === null) return
      if (draggedPercent.current === null) draggedPercent.current = asPercentage
      panel.resize(`${wanted}%`)
    },
    [panelRef]
  )

  const shrink = React.useCallback(() => {
    const panel = panelRef.current
    const back = draggedPercent.current
    // Cleared first, so the layout change this causes is saved like any other.
    // It writes back the height that was already stored, which costs nothing
    // and leaves the panel and the memory of it agreeing again.
    draggedPercent.current = null
    if (panel && back !== null) panel.resize(`${back}%`)
  }, [panelRef])

  const grown = React.useCallback(() => draggedPercent.current !== null, [])

  const onLayoutChanged = React.useCallback(
    (layout: Layout, meta: LayoutChangedMeta) => {
      // A drag wins: the new height becomes the remembered one and the one a
      // second press on the same tab returns to.
      if (meta.isUserInteraction) draggedPercent.current = null
      else if (draggedPercent.current !== null) return
      save(layout)
    },
    [save]
  )

  // One object for as long as the moves are the same moves, so a panel holding
  // it can compare it against what it held last render.
  return React.useMemo(
    () => ({ grow, shrink, grown, onLayoutChanged }),
    [grow, shrink, grown, onLayoutChanged]
  )
}
