import * as React from "react"
import { createPortal } from "react-dom"
import { CopyIcon, Trash2Icon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * A point on the page for a menu or dropdown to open from. It sits in the
 * page's body so no scroller or moved panel shifts it off the mouse.
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

/** Duplicate and Delete for a right-clicked task, the Board card's "..." items. Delete shows only where it is allowed. */
export function TaskRightClickMenu({
  at,
  onClose,
  canDelete,
  onDuplicate,
  onDelete,
}: {
  at: { x: number; y: number }
  onClose: () => void
  canDelete: boolean
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    // Not modal, so a right-click on another task moves the menu there in one go.
    // Open while mounted: the page shows it on a right-click and takes it away on close.
    <DropdownMenu open onOpenChange={(open) => (open ? undefined : onClose())} modal={false}>
      <DropdownMenuTrigger asChild>
        <PointAnchor x={at.x} y={at.y} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuItem onSelect={onDuplicate}>
          <CopyIcon className="size-4" />
          Duplicate
        </DropdownMenuItem>
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2Icon className="size-4" />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
