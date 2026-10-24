import * as React from "react"
import { MeasuringStrategy, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"

import { HEADING_DROP, settleDrop, type ListDrop } from "@/lib/project/list-drop"

type Section<T> = { key: string; label: string | null; rows: T[] }

/** Where the held row sits while it is over another heading: that heading, at this place. */
type Into = { heading: string; index: number }

type ListDropOptions<T> = {
  /** Every heading in order, for those that show even when empty. */
  groups?: readonly { key: string; label: string }[]
  /** A row let go inside its heading or under another. Left out, nothing drags. */
  onDrop?: (drop: ListDrop) => void
  /** Whether `row` may go from one heading to another; inside its own it always may. */
  canMove: (from: string, to: string, row: T) => boolean
  /** Headings that show even with no rows, so a row can be dropped there. */
  showsEmpty?: (key: string) => boolean
  /** The task a row is, when a row's drag id is not its task's id (a task under several tags). */
  taskIdOf?: (row: T) => string
}

/**
 * Dragging rows on a grouped List. The rows slide apart to open a gap where
 * the held row would land, under its own heading or any other that takes it
 * (Tyler, 24 Oct 2026: "why cant we use the old drag and drop animation and
 * still keep sections in place?"). The held row's place shows dimmed in the
 * gap while a copy follows the pointer.
 */
export function useListDrop<T extends { id: string }>(sections: Section<T>[], options: ListDropOptions<T>) {
  const { groups, onDrop, canMove, showsEmpty, taskIdOf = (row: T) => row.id } = options
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [into, setInto] = React.useState<Into | null>(null)
  const base: Section<T>[] =
    onDrop && groups && showsEmpty
      ? groups
          .map((group) => sections.find((section) => section.key === group.key) ?? { ...group, rows: [] })
          .filter((section) => section.rows.length > 0 || showsEmpty(section.key))
      : sections
  const from = activeId ? base.find((section) => section.rows.some((row) => row.id === activeId)) : undefined
  const held = from?.rows.find((row) => row.id === activeId)
  // Over another heading, the held row is moved there so that heading's rows make room for it.
  const shown =
    from && held && into
      ? base.map((section) =>
          section.key === from.key
            ? { ...section, rows: section.rows.filter((row) => row.id !== held.id) }
            : section.key === into.heading
              ? { ...section, rows: [...section.rows.slice(0, into.index), held, ...section.rows.slice(into.index)] }
              : section
        )
      : base

  function reset() {
    setActiveId(null)
    setInto(null)
  }

  /** Into the heading the pointer is over, if the row may go there; above or below the row's middle. */
  function follow(event: DragOverEvent) {
    const over = event.over
    if (!from || !held || !over || over.id === activeId) return
    const overId = String(over.id)
    const onHeading = overId.startsWith(HEADING_DROP)
    const target = onHeading
      ? shown.find((section) => section.key === overId.slice(HEADING_DROP.length))
      : shown.find((section) => section.rows.some((row) => row.id === overId))
    const current = shown.find((section) => section.rows.some((row) => row.id === activeId))
    if (!target || target === current) return
    if (target.key === from.key) return setInto(null)
    if (!canMove(from.key, target.key, held)) return
    const rect = event.active.rect.current.translated
    const below = !onHeading && rect ? rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 : false
    const index = onHeading ? 0 : target.rows.findIndex((row) => row.id === overId) + (below ? 1 : 0)
    setInto({ heading: target.key, index })
  }

  return {
    sections: shown,
    held,
    /** Spread on the DndContext. */
    context: {
      // Headings gain and lose rows mid-drag, so their places are measured all the time.
      measuring: { droppable: { strategy: MeasuringStrategy.Always } },
      onDragStart: (event: DragStartEvent) => {
        if (onDrop) setActiveId(String(event.active.id))
      },
      onDragOver: follow,
      onDragCancel: reset,
      onDragEnd: (event: DragEndEvent) => {
        const current = shown.find((section) => section.rows.some((row) => row.id === activeId))
        reset()
        if (!onDrop || !from || !held || !current || !event.over) return
        const rows = current.rows
        const overAt = rows.findIndex((row) => row.id === String(event.over!.id))
        const atAt = rows.findIndex((row) => row.id === held.id)
        const result = settleDrop(
          { key: from.key, taskIds: from.rows.map(taskIdOf) },
          current.key,
          taskIdOf(held),
          (overAt < 0 ? rows : arrayMove(rows, atAt, overAt)).map(taskIdOf),
          (a, b) => canMove(a, b, held)
        )
        if (result) onDrop(result)
      },
    },
  }
}
