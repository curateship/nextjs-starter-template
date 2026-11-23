/**
 * A row dragged on a grouped List, once let go: from one heading to the same
 * one (a new order) or to another, with that heading's rows in their new
 * order. Used by My dashboard (`my-task-order.ts`) and a project's List
 * (`task-groups.ts`), which each say what a move under another heading does.
 */
export type ListDrop = { taskId: string; from: string; to: string; taskIds: string[] }

/** A heading's own drop zone, beside its rows' ids, so an empty heading can take a row. */
export const HEADING_DROP = "heading:"

/**
 * What letting go of `taskId` does once the drag has put it under `to` with
 * that heading's rows as `taskIds`. Null when nothing changes or the move
 * isn't allowed.
 */
export function settleDrop(
  from: { key: string; taskIds: readonly string[] },
  to: string,
  taskId: string,
  taskIds: string[],
  canMove: (from: string, to: string) => boolean
): ListDrop | null {
  if (to === from.key) {
    const unchanged = taskIds.every((id, index) => id === from.taskIds[index])
    return unchanged ? null : { taskId, from: to, to, taskIds }
  }
  return canMove(from.key, to) ? { taskId, from: from.key, to, taskIds } : null
}
