import type { TaskStatus } from "@/lib/project/rules"

/**
 * Right-click on the project page's task tabs (Tyler, 22 Oct 2026, Misc 3):
 * on a task it opens Duplicate and Delete, and on empty space it opens New
 * task where the mouse is. The tabs mark what sits under the mouse with data
 * attributes, so this reads the page instead of every tab passing handlers up:
 *
 * - `data-task-id` on a List row, Board card, Calendar chip and Timeline row.
 * - `data-new-status` and `data-new-lane` on a Board column.
 * - `data-new-due` on a Calendar day of the month shown.
 * - `data-new-group` on a List heading.
 */
export type RightClickTarget =
  | { kind: "task"; taskId: string }
  | { kind: "new"; status?: TaskStatus; lane?: string; due?: string; group?: string }

/** Where the browser's own menu is the right one: typing or a link. */
const BROWSER_MENU = "input, textarea, select, [contenteditable=''], [contenteditable='true'], a[href]"

/**
 * Whether the mouse went down on words already picked, to copy them. Read as
 * the button goes down: on a Mac the right button picks the word under it
 * before the menu opens, and that word was never picked by the person.
 */
export function pickedWordsUnder(target: EventTarget | null) {
  const selection = window.getSelection()
  if (!(target instanceof Node) || !selection || selection.isCollapsed || !selection.toString().trim()) return false
  for (let i = 0; i < selection.rangeCount; i++) {
    if (selection.getRangeAt(i).intersectsNode(target)) return true
  }
  return false
}

/** What the right-click landed on; null keeps the browser's own menu. */
export function readRightClick(target: EventTarget | null, onPickedWords = false): RightClickTarget | null {
  if (!(target instanceof Element) || onPickedWords || target.closest(BROWSER_MENU)) return null
  const task = target.closest<HTMLElement>("[data-task-id]")
  if (task?.dataset.taskId) return { kind: "task", taskId: task.dataset.taskId }
  const column = target.closest<HTMLElement>("[data-new-status]")
  const day = target.closest<HTMLElement>("[data-new-due]")
  const heading = target.closest<HTMLElement>("[data-new-group]")
  return {
    kind: "new",
    status: column?.dataset.newStatus as TaskStatus | undefined,
    lane: column?.dataset.newLane,
    due: day?.dataset.newDue,
    group: heading?.dataset.newGroup,
  }
}
