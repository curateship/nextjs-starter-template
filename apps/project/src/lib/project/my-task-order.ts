import { addDays } from "@/lib/project/days"
import { DUE_GROUPS } from "@/lib/project/task-filters"

/**
 * My dashboard's List in my own order, and what a drop under another heading
 * does (Tyler, 23 Oct 2026: "I want to be able to drag and drop tasks into
 * different order and sections"). The order is mine alone and is kept per
 * heading; a task that lands under a heading some other way goes to its bottom.
 */
export const MY_HEADINGS = [...DUE_GROUPS.map((group) => group.key), "done"] as const
export type MyHeading = (typeof MY_HEADINGS)[number]

export function isMyHeading(value: string): value is MyHeading {
  return (MY_HEADINGS as readonly string[]).includes(value)
}

/** A task's place in my order, under the heading it was set in. */
export type MyPlace = { taskId: string; heading: string; position: number }

/** What a task dropped under `heading` changes into; null where nothing can be dropped. */
export type DropChange = { dueDate: string | null } | { status: "done" }

/**
 * Today is due today, This week tomorrow, Later eight days on and No date
 * clears the date; Done marks it Done. Overdue and Waiting for my answer take
 * no drops, since no date puts a task there by choice.
 */
export function dropChange(heading: string, today: string): DropChange | null {
  switch (heading) {
    case "today":
      return { dueDate: today }
    case "week":
      return { dueDate: addDays(today, 1) }
    case "later":
      return { dueDate: addDays(today, 8) }
    case "none":
      return { dueDate: null }
    case "done":
      return { status: "done" }
    default:
      return null
  }
}

/**
 * Whether a row under `from` can be dropped under `to`. A waiting task stays
 * under Waiting and a Done one under Done whatever its date, and today's picks
 * come from the check-in, so none of those leave their heading.
 */
export function canMove(from: string, to: string) {
  return from !== to && MOVABLE_FROM.has(from) && DROP_TARGETS.has(to)
}
const MOVABLE_FROM = new Set(["overdue", "today", "week", "later", "none"])
const DROP_TARGETS = new Set(["today", "week", "later", "none", "done"])

/** Whether a heading takes drops at all, so it shows even when empty, as Notion's groups do. */
export function takesDrops(heading: string) {
  return DROP_TARGETS.has(heading)
}

/**
 * One heading's rows in my order: the ones I placed under this heading first,
 * then the rest as they came, so a newcomer sits at the bottom.
 */
export function inMyOrder<T extends { id: string }>(rows: readonly T[], heading: string, places: readonly MyPlace[]) {
  const at = new Map(places.filter((place) => place.heading === heading).map((place) => [place.taskId, place.position]))
  const placed = rows.filter((row) => at.has(row.id)).sort((a, b) => at.get(a.id)! - at.get(b.id)!)
  return [...placed, ...rows.filter((row) => !at.has(row.id))]
}
