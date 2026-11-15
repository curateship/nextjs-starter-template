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
 * Tags were removed on 6 Nov 2026, and their grouping with them. So were
 * task templates (Tyler: "We need to remove the tasks templates feature too").
 */
export const TASK_GROUPINGS = ["none", "status", "priority", "due", "assignee"] as const
export type TaskGrouping = (typeof TASK_GROUPINGS)[number]

export const TASK_GROUPING_LABEL: Record<TaskGrouping, string> = {
  none: "None",
  status: "Status",
  priority: "Priority",
  due: "Due date",
  assignee: "Assigned to",
}

export type TaskGroup = { key: string; label: string }

/** What grouping needs to know of a task. */
export type GroupableTask = {
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  dueAt: string | null
  assignee: { id: string; name: string } | null
}

const NONE = "none"

/** The due-date groups, soonest first; Earlier holds Done tasks whose day has passed. */
const DUE_GROUPS: TaskGroup[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
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
  if (day === addDays(today, 1)) return "tomorrow"
  // The rest of the Due filter's "This week", today and the six days after it.
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
 * The groups that have tasks in them, in order, and the group each task sits
 * in, as a list. Null for "none": one plain list.
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
      case "due":
        return [dueGroupOf(task, now)]
      case "assignee":
        return [task.assignee?.id ?? NONE]
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
    case "assignee":
      all = byName(
        tasks.flatMap((task) => (task.assignee ? [task.assignee] : [])),
        "Nobody",
        tasks.some((task) => !task.assignee)
      )
      break
  }
  const used = new Set(tasks.flatMap(groupsOf))
  return { groups: all.filter((group) => used.has(group.key)), groupsOf }
}

/** The due-date headings a task can be dropped under; nothing is made Overdue or Earlier by hand. */
const DUE_DROPS = new Set(["today", "tomorrow", "week", "later", NONE])

/**
 * Whether a task dragged on a project's List may go under another heading,
 * which changes what it is grouped by (Tyler, 24 Oct 2026).
 */
export function canMoveInGroup(grouping: TaskGrouping, to: string) {
  switch (grouping) {
    case "status":
    case "priority":
    case "assignee":
      return true
    case "due":
      return DUE_DROPS.has(to)
    default:
      return false
  }
}

/**
 * My dashboard's Group row (Tyler, 31 Oct 2026: "my dashboard is missing
 * "Group" function in filter"). It starts on My headings, the List's own
 * Picked for today, due date and Done headings with my order, and offers the
 * project List's groupings plus Project, since its tasks come from many
 * projects. He picked keeping My headings as the start.
 */
export const MY_GROUPINGS = ["mine", "status", "priority", "due", "assignee", "project"] as const
export type MyGrouping = (typeof MY_GROUPINGS)[number]

export const MY_GROUPING_LABEL: Record<MyGrouping, string> = {
  mine: "My headings",
  status: TASK_GROUPING_LABEL.status,
  priority: TASK_GROUPING_LABEL.priority,
  due: TASK_GROUPING_LABEL.due,
  assignee: TASK_GROUPING_LABEL.assignee,
  project: "Project",
}

/** My dashboard's groups for any grouping but My headings, which the List draws itself. */
export function groupMyTasks<T extends GroupableTask & { projectId: string; projectName: string }>(
  tasks: readonly T[],
  grouping: Exclude<MyGrouping, "mine">,
  now = new Date()
): { groups: TaskGroup[]; groupsOf: (task: T) => string[] } {
  if (grouping !== "project") return groupTasks(tasks, grouping, now)!
  return {
    groups: byName(tasks.map((task) => ({ id: task.projectId, name: task.projectName })), "", false),
    groupsOf: (task) => [task.projectId],
  }
}
