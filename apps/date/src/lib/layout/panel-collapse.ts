import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"

/**
 * Opens a panel if it is shut and shuts it if it is open.
 *
 * Every way of collapsing a panel — the tab on the canvas edge, a double-click
 * on blank space — goes through this, so they cannot drift apart.
 */
export function usePanelToggle(
  panelRef: React.RefObject<PanelImperativeHandle | null>
) {
  return React.useCallback(() => {
    const panel = panelRef.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }, [panelRef])
}

/** How long a side panel takes to fold or open. */
export const PANEL_FOLD_MS = 240

/**
 * On a panel group while a side panel folds or opens: the panels' widths
 * (their `flex` numbers) and the gaps between them ease. None with less
 * motion asked for.
 */
const PANEL_FOLDING_CLASS =
  "[&>[data-panel]]:transition-[flex-grow] [&>[data-slot=resizable-handle]]:transition-[width] [&>*]:duration-[240ms] [&>*]:ease-in-out motion-reduce:[&>*]:transition-none"

/**
 * A side panel folding or opening slides there over 240ms, rather than
 * snapping and then jumping again a frame later when the gap beside it closes
 * (Tyler, 11 Nov 2026: "too jaggy like it bounces a bit on collapsing and
 * uncollpasing, make it smooth", first on Trade, then "should be made to the
 * shells too").
 *
 * `fold(change)` runs a collapse or expand with the ease on, and `className`
 * goes on the panel group. The ease is on only for the fold, so a dragged
 * divider still follows the pointer at once.
 */
export function usePanelFold() {
  const [folding, setFolding] = React.useState(false)
  const timer = React.useRef<number | null>(null)
  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    []
  )
  const fold = React.useCallback((change: () => void) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    setFolding(true)
    // Two frames: the transition has to be on screen before the widths move.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        change()
        timer.current = window.setTimeout(() => {
          timer.current = null
          setFolding(false)
        }, PANEL_FOLD_MS + 50)
      })
    )
  }, [])
  return { fold, className: folding ? PANEL_FOLDING_CLASS : undefined }
}

/**
 * Whether a panel is currently shut, as a value a component can draw with.
 *
 * The panel library answers `isCollapsed()` when asked but never says so on its
 * own — no callback, no attribute — so the only way to draw differently while a
 * panel is shut is to ask after every resize and remember the answer.
 *
 * Spread `onResize` onto the panel and read `collapsed`. The first read happens
 * on mount as well, because a remembered layout can start collapsed and no
 * resize ever fires for it.
 */
export function usePanelCollapsed(
  panelRef: React.RefObject<PanelImperativeHandle | null>
) {
  const [collapsed, setCollapsed] = React.useState(false)

  const read = React.useCallback(() => {
    setCollapsed(panelRef.current?.isCollapsed() ?? false)
  }, [panelRef])

  React.useEffect(read, [read])

  return { collapsed, onResize: read }
}

/**
 * Things a double-click already means something on, so it must never also
 * shut the panel: anything clickable, anything typed into, and anything
 * dragged. A double-click landing inside one of these is that control's.
 */
const CONTROLS = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "summary",
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='combobox']",
  "[contenteditable='true']",
  "[draggable='true']",
].join(",")

/**
 * True when a double-click landed on blank space rather than on something.
 *
 * Two checks, and between them they cover every case without anyone having to
 * mark up the blank bits:
 *
 * - it is not inside a control (buttons, links, boxes, draggable cards)
 * - it did not land on a word
 *
 * The second one reads the selection, because a double-click on text selects
 * the word under the pointer. It is not enough to ask whether anything is
 * selected: clicking blank space in a scrolling list makes the browser reach
 * out and grab the nearest word anyway. So it asks where the selected words
 * are — if none of them is under the pointer, the pointer was on blank space,
 * and that stray highlight is cleared on the way out.
 */
function isBlankSpace(event: React.MouseEvent): boolean {
  const target = event.target as HTMLElement | null
  if (!target || typeof target.closest !== "function") return false
  if (target.closest(CONTROLS)) return false

  const selection = typeof window === "undefined" ? null : window.getSelection()
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    return true
  }

  const { clientX, clientY } = event
  for (let index = 0; index < selection.rangeCount; index += 1) {
    for (const rect of selection.getRangeAt(index).getClientRects()) {
      const onTheWord =
        clientX >= rect.left - 2 &&
        clientX <= rect.right + 2 &&
        clientY >= rect.top - 2 &&
        clientY <= rect.bottom + 2
      if (onTheWord) return false
    }
  }

  selection.removeAllRanges()
  return true
}

/**
 * Double-clicking the empty part of a panel opens or shuts it — the same
 * gesture the side panels, the bottom panel and the sidebar all have.
 *
 * Hand it whatever already opens and shuts that panel.
 */
export function useBlankSpaceDoubleClick(toggle: () => void) {
  return React.useCallback(
    (event: React.MouseEvent) => {
      if (!isBlankSpace(event)) return
      toggle()
    },
    [toggle]
  )
}
