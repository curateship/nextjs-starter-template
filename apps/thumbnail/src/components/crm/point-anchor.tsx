import * as React from "react"
import { createPortal } from "react-dom"

/**
 * A point on the page for a right-click menu to open from, copied from
 * Project's `task-right-click.tsx`. It sits in the page's body so no scroller
 * or moved panel shifts it off the mouse.
 */
export const PointAnchor = React.forwardRef<HTMLSpanElement, { x: number; y: number }>(function PointAnchor(
  { x, y, ...props },
  ref
) {
  return createPortal(
    <span ref={ref} aria-hidden {...props} className="pointer-events-none fixed size-0" style={{ left: x, top: y }} />,
    document.body
  )
})
