import { dueDayOf, isOverdue, todayKey } from "@/lib/project/dates"
import { addDays } from "@/lib/project/days"
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/project/rules"

/**
 * What the List and Timeline put their rows under, picked in Filter's Group
 * row the way Notion does (Tyler, 19 Oct 2026: "I can group by various things
 * like date, status, tags, priority"). It replaced the project's sections.
 */
export const TASK_GROUPINGS = ["none", "status", "priority", "tags", "due", "assignee", "type"] as const
export type TaskGrouping = (typeof TASK_GROUPINGS)[number]

export const TASK_GROUPING_LABEL: Record<TaskGrouping, string> = {
  none: "None",
  status: "Status",
  priority: "Priority",
  tags: "Tags",
  due: "Due date",
  assignee: "Assigned to",
  type: "Template",
}

export type TaskGroup = { key: string; label: string }

/** What grouping needs to know of a task. */
export type GroupableTask = {
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  dueAt: string | null
  labels: { id: string; name: string }[]
  assignee: { id: string; name: string } | null
  type: { id: string; name: string } | null
}

const NONE = "none"

/** The due-date groups, soonest first; Earlier holds Done tasks whose day has passed. */
const DUE_GROUPS: TaskGroup[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "earlier", label: "Earlier" },
  { key: NONE, label: "No due date" },
]

function dueGroupOf(task: GroupableTask, now: Date) {
  if (!task.dueDate) return NONE
  if (isOverdue(task.dueDate, task.status, task.dueAt, now)) return "overdue"
  const today = todayKey(now)
  const day = dueDayOf(task)!
  if (day < today) return "earlier"
  if (day === today) return "today"
  // Today and the six days after it, as the Due filter's "This week".
  return day <= addDays(today, 6) ? "week" : "later"
}

/** Each named thing once, by name, with the "none" group last. */
function byName(items: { id: string; name: string }[], noneLabel: string, hasNone: boolean): TaskGroup[] {
  const seen = new Map(items.map((item) => [item.id, item.name]))
  return [
    ...[...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([key, label]) => ({ key, label })),
    ...(hasNone ? [{ key: NONE, label: noneLabel }] : []),
  ]
}

/**
 * The groups that have tasks in them, in order, and which group (or, for
 * tags, groups) each task sits in. A task with three tags shows under each.
 * Null for "none": one plain list.
 */
export function groupTasks<T extends GroupableTask>(
  tasks: readonly T[],
  grouping: TaskGrouping,
  now = new Date()
): { groups: TaskGroup[]; groupsOf: (task: T) => string[] } | null {
  const groupsOf = (task: T): string[] => {
    switch (grouping) {
      case "status":
        return [task.status]
      case "priority":
        return [task.priority]
      case "tags":
        return task.labels.length ? task.labels.map((label) => label.id) : [NONE]
      case "due":
        return [dueGroupOf(task, now)]
      case "assignee":
        return [task.assignee?.id ?? NONE]
      case "type":
        return [task.type?.id ?? NONE]
      default:
        return [NONE]
    }
  }
  let all: TaskGroup[]
  switch (grouping) {
    case "none":
      return null
    case "status":
      all = TASK_STATUSES.map((status) => ({ key: status, label: TASK_STATUS_LABEL[status] }))
      break
    case "priority":
      all = TASK_PRIORITIES.map((priority) => ({ key: priority, label: TASK_PRIORITY_LABEL[priority] }))
      break
    case "due":
      all = DUE_GROUPS
      break
    case "tags":
      all = byName(tasks.flatMap((task) => task.labels), "No tags", tasks.some((task) => !task.labels.length))
      break
    case "assignee":
      all = byName(
        tasks.flatMap((task) => (task.assignee ? [task.assignee] : [])),
        "Nobody",
        tasks.some((task) => !task.assignee)
      )
      break
    case "type":
      all = byName(
        tasks.flatMap((task) => (task.type ? [task.type] : [])),
        "No template",
        tasks.some((task) => !task.type)
      )
      break
  }
  const used = new Set(tasks.flatMap(groupsOf))
  return { groups: all.filter((group) => used.has(group.key)), groupsOf }
}

/** The due-date headings a task can be dropped under; nothing is made Overdue or Earlier by hand. */
const DUE_DROPS = new Set(["today", "week", "later", NONE])

/**
 * Whether a task dragged on a project's List may go under another heading,
 * which changes what it is grouped by (Tyler, 24 Oct 2026). By tags it swaps
 * the tag it was under for the new one, so a heading it is already under
 * refuses it, and No tags takes it only when that was its one tag.
 */
export function canMoveInGroup(grouping: TaskGrouping, to: string, task: GroupableTask) {
  switch (grouping) {
    case "status":
    case "priority":
    case "assignee":
    case "type":
      return true
    case "due":
      return DUE_DROPS.has(to)
    case "tags":
      return to === NONE ? task.labels.length === 1 : !task.labels.some((label) => label.id === to)
    default:
      return false
  }
}
