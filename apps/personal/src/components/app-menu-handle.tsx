import * as React from "react"

import { MAX_APP_MENU_WIDTH } from "@/lib/menu"
import type { PanelZoom } from "@/lib/use-panel-view"

/** The arrow keys move the edge this far per press, in the app's own pixels. */
const KEYBOARD_STEP = 8

function clamp(width: number) {
  return Math.round(Math.min(Math.max(width, 0), MAX_APP_MENU_WIDTH))
}

/**
 * The panel's left edge while the menu is being edited: drag it right to slide
 * the open app's own left menu out of sight, or left to bring it back. The app
 * moves with the pointer, and the width is saved for that app when the drag
 * ends. The arrow keys move it too. Personal can't read another site's layout,
 * which is why the width is dragged into place rather than found.
 */
export function AppMenuHandle({
  host,
  width,
  zoom,
  onPreview,
  onCommit,
}: {
  host: string
  /** The saved width, in the app's own pixels. */
  width: number
  zoom: PanelZoom
  /** The width to show while dragging, or null once the drag is over. */
  onPreview: (width: number | null) => void
  onCommit: (width: number) => void
}) {
  const dragRef = React.useRef<{ startX: number; startWidth: number; width: number } | null>(null)

  function endDrag(save: boolean) {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    document.body.style.removeProperty("cursor")
    document.body.style.removeProperty("user-select")
    if (save && drag.width !== drag.startWidth) onCommit(drag.width)
    onPreview(null)
  }

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Hide ${host}'s own menu`}
        aria-valuemin={0}
        aria-valuemax={MAX_APP_MENU_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        // Starts just inside the panel, clear of the edge that resizes
        // Personal's own menu.
        className="absolute inset-y-0 left-2 z-20 w-4 cursor-col-resize touch-none outline-hidden after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-sidebar-border hover:after:bg-sidebar-ring focus-visible:after:bg-sidebar-ring"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          // Captured, so the drag keeps going over the app's frame.
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = { startX: event.clientX, startWidth: width, width }
          document.body.style.cursor = "col-resize"
          document.body.style.userSelect = "none"
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag) return
          drag.width = clamp(drag.startWidth + (event.clientX - drag.startX) / zoom)
          onPreview(drag.width)
        }}
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
          event.preventDefault()
          onCommit(clamp(width + (event.key === "ArrowRight" ? KEYBOARD_STEP : -KEYBOARD_STEP)))
        }}
      />
      <p className="pointer-events-none absolute top-2 left-7 z-20 rounded-md border bg-sidebar px-2 py-1 text-xs text-sidebar-foreground shadow-sm">
        Drag the line to hide this app&apos;s menu
      </p>
    </>
  )
}
