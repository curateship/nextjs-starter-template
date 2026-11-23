import * as React from "react"

import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { pxToMs } from "@/lib/video/timeline-utils"

type Drag<T> = { item: T; startX: number; startY: number; moved: boolean }

/**
 * The lane a drop at this point lands on. The pointer is captured by the
 * tile, so the page is asked what is under it.
 *
 * Anywhere in the timeline counts, not only the lane strips: the ruler, the
 * gutter and the empty space under the last lane take the lane nearest the
 * pointer, because a timeline with one lane is mostly empty space and a drop
 * there used to add nothing. Null means a timeline with no lanes yet, and
 * undefined means the pointer was not over the timeline at all.
 */
function laneAt(x: number, y: number): HTMLElement | null | undefined {
  const under = document.elementsFromPoint(x, y)
  const direct = under.find((element) => element.matches("[data-track-lane]"))
  if (direct) return direct as HTMLElement
  const timeline = under.find((element) => element.matches("[data-timeline-drop]"))
  if (!timeline) return undefined
  let nearest: HTMLElement | null = null
  let nearestGap = Infinity
  for (const lane of timeline.querySelectorAll<HTMLElement>("[data-track-lane]")) {
    const rect = lane.getBoundingClientRect()
    const gap = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
    if (gap < nearestGap) {
      nearest = lane
      nearestGap = gap
    }
  }
  return nearest
}

/**
 * Dragging something from a panel beside the rail onto a timeline lane. It
 * lands where it is let go. Shared by the Media panel and the AI clip panel,
 * so a file dragged from either becomes a clip the same way.
 *
 * Dragging is the only way anything reaches the timeline: a plain click does
 * nothing, so a look at a tile never lands a clip by accident. The lane under
 * the pointer is found by asking the page what is there, which keeps the panel
 * and the timeline from having to know about each other.
 */
export function useDragToTimeline<T>({
  label,
  onDrop,
}: {
  /** What the little label under the pointer says while dragging. */
  label: (item: T) => string
  onDrop: (item: T, atMs: number, trackId: string | undefined) => void
}) {
  const { store } = useEditorRuntime()
  const [ghost, setGhost] = React.useState<{
    label: string
    x: number
    y: number
  } | null>(null)
  const dragRef = React.useRef<Drag<T> | null>(null)

  function down(event: React.PointerEvent, item: T) {
    if (event.button !== 0) return
    dragRef.current = {
      item,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function move(event: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5
    ) {
      return
    }
    drag.moved = true
    setGhost({ label: label(drag.item), x: event.clientX, y: event.clientY })
  }

  function up(event: React.PointerEvent) {
    const drag = dragRef.current
    dragRef.current = null
    setGhost(null)
    if (!drag) return
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId
      )
    } catch {
      /* noop */
    }
    if (!drag.moved) return
    const lane = laneAt(event.clientX, event.clientY)
    if (lane === undefined) return
    if (!lane) {
      onDrop(drag.item, 0, undefined)
      return
    }
    const rect = lane.getBoundingClientRect()
    const pps = store.getSnapshot().state.pxPerSecond
    onDrop(
      drag.item,
      Math.max(0, pxToMs(event.clientX - rect.left, pps)),
      lane.dataset.trackId
    )
  }

  function cancel() {
    dragRef.current = null
    setGhost(null)
  }

  return {
    /** Spread onto the tile that drags. */
    dragHandlers: (item: T) => ({
      onPointerDown: (event: React.PointerEvent) => down(event, item),
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: cancel,
    }),
    ghost: ghost ? (
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: ghost.x + 12,
          top: ghost.y + 12,
          zIndex: 90,
          padding: "6px 10px",
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          background: "var(--ink)",
          color: "var(--paper)",
          borderRadius: 9,
          fontSize: 11.5,
          fontWeight: 600,
          pointerEvents: "none",
          boxShadow: "var(--sh)",
        }}
      >
        {ghost.label}
      </div>
    ) : null,
  }
}
