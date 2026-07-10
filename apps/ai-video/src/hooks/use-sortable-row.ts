import type * as React from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// useSortable plus the standard row drag style (transform + fade while
// dragging) shared by the settings editors' sortable rows.
export function useSortableRow(id: string) {
  const sortable = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.55 : 1,
  }
  return { ...sortable, style }
}
