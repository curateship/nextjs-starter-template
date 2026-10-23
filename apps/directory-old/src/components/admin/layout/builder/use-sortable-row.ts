"use client"

import type { CSSProperties } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

/**
 * dnd-kit's `useSortable` plus the transform/fade style that every draggable
 * row in the admin was building by hand — the same six-line block in ~20 files.
 *
 * `dragOpacity` is a parameter rather than a constant because the lists do not
 * agree: most fade to 0.5 while dragging, the sidebar settings rows use 0.55
 * and one uses 0.6. Each caller passes what it already had, so nothing looks
 * different.
 */
export function useSortableRow(id: string, dragOpacity = 0.5) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? dragOpacity : 1,
  }

  return { attributes, listeners, setNodeRef, style, isDragging, transform, transition }
}
