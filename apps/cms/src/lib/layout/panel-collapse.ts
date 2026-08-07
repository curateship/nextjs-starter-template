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
