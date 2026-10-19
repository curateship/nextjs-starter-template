import * as React from "react"

import {
  clampSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "@/lib/menu"

/** The arrow keys move the edge this far per press, as in Custom Shell. */
const KEYBOARD_STEP = 8
/** A held arrow key is one save, written this long after the last press. */
const KEYBOARD_SAVE_DELAY_MS = 500

/**
 * The left menu's right edge, dragged to make the menu wider or narrower.
 * While dragging only `--sidebar-width` on the page changes; the width is
 * saved once, when the drag ends. The arrow keys move it too. It is Custom
 * Shell's rail without the click that folds the menu away.
 */
export function SidebarResizeHandle({
  width,
  onCommit,
}: {
  width: number
  onCommit: (width: number) => void
}) {
  const dragRef = React.useRef<{ startX: number; startWidth: number; width: number; root: HTMLElement } | null>(null)
  const nudgeRef = React.useRef<{ width: number; timer: ReturnType<typeof setTimeout> } | null>(null)

  const show = (root: HTMLElement, next: number) =>
    root.style.setProperty("--sidebar-width", `${next}px`)

  const flushNudge = React.useCallback(() => {
    const nudge = nudgeRef.current
    if (!nudge) return
    clearTimeout(nudge.timer)
    nudgeRef.current = null
    onCommit(nudge.width)
  }, [onCommit])

  function endDrag(save: boolean) {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    document.body.style.removeProperty("cursor")
    document.body.style.removeProperty("user-select")
    if (save && drag.width !== drag.startWidth) onCommit(drag.width)
    else show(drag.root, drag.startWidth)
  }

  return (
    // Hovering the edge only changes the pointer to the resize arrows; the
    // thick line it used to draw over the menu's edge is gone (Tyler, 18 Oct
    // 2026). The line still shows when the edge has keyboard focus.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the menu"
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      className="absolute inset-y-0 -right-2 z-20 hidden w-4 cursor-col-resize touch-none outline-hidden after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 focus-visible:after:bg-sidebar-ring md:block"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        const root = event.currentTarget.closest<HTMLElement>("[data-sidebar-root]")
        if (!root) return
        flushNudge()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { startX: event.clientX, startWidth: width, width, root }
        document.body.style.cursor = "col-resize"
        document.body.style.userSelect = "none"
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag) return
        drag.width = clampSidebarWidth(drag.startWidth + event.clientX - drag.startX)
        show(drag.root, drag.width)
      }}
      onPointerUp={() => endDrag(true)}
      onPointerCancel={() => endDrag(false)}
      onBlur={flushNudge}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
        event.preventDefault()
        const root = event.currentTarget.closest<HTMLElement>("[data-sidebar-root]")
        if (!root) return
        const from = nudgeRef.current?.width ?? width
        const next = clampSidebarWidth(
          from + (event.key === "ArrowRight" ? KEYBOARD_STEP : -KEYBOARD_STEP)
        )
        show(root, next)
        if (nudgeRef.current) clearTimeout(nudgeRef.current.timer)
        nudgeRef.current = { width: next, timer: setTimeout(flushNudge, KEYBOARD_SAVE_DELAY_MS) }
      }}
    />
  )
}
