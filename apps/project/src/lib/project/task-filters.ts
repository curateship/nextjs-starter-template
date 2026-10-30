import { dueDayOf, isOverdue, todayKey } from "@/lib/project/dates"
import { matchesClient, readClientFilter } from "@/lib/project/clients"
import { addDays } from "@/lib/project/days"
import {
  DONE_RECENT_DAYS,
  isTaskPriority,
  isTaskStatus,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/project/rules"

/**
 * Narrowing a list of tasks: a search over title and notes, and Status,
 * Priority, Person, Label, Type, due-date, Client and Project filters. They live in the page's address, so a
 * pasted link keeps them. The search doesn't look inside a type's fields.
 */

/** A task with nobody assigned, for the Person filter. */
export const NOBODY_FILTER = "nobody"

/**
 * The project page's due-date dropdown. "This week" is today and the six days
 * after it, and "Next week" the seven days after those, on the reader's own
 * clock. Overdue leaves out Done tasks, as the red date on a card does.
 */
export const DUE_FILTERS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "next-week", label: "Next week" },
  { key: "none", label: "No date" },
] as const
export type DueFilter = (typeof DUE_FILTERS)[number]["key"]

export function isDueFilter(value: unknown): value is DueFilter {
  return DUE_FILTERS.some((option) => option.key === value)
}

export type TaskFilters = {
  q?: string
  status?: TaskStatus
  priority?: TaskPriority
  /** A person's id, or `NOBODY_FILTER`. */
  person?: string
  label?: string
  /** A task type's id. */
  type?: string
  due?: DueFilter
  /** A client's name, or `NO_CLIENT_FILTER`. My dashboard only: a project has one client. */
  client?: string
  /** A project's id. The site admin's My dashboard only, set from its Filter or its Projects card. */
  project?: string
}

type Filterable = {
  title: string
  notesText: string
  status: TaskStatus
  priority: TaskPriority
  assignee: { id: string } | null
  labels: { id: string }[]
  type: { id: string } | null
  dueDate?: string | null
  dueAt?: string | null
  projectClient?: string | null
  projectId?: string
}

const ID = /^[\w-]{1,36}$/

/** The filters out of an address, ignoring anything that isn't one. */
export function readTaskFilters(search: Record<string, unknown>): TaskFilters {
  const result: TaskFilters = {}
  if (typeof search.q === "string" && search.q.trim()) result.q = search.q.slice(0, 200)
  if (isTaskStatus(search.status)) result.status = search.status
  if (isTaskPriority(search.priority)) result.priority = search.priority
  if (typeof search.person === "string" && ID.test(search.person)) result.person = search.person
  if (typeof search.label === "string" && ID.test(search.label)) result.label = search.label
  if (typeof search.type === "string" && ID.test(search.type)) result.type = search.type
  if (isDueFilter(search.due)) result.due = search.due
  const client = readClientFilter(search.client)
  if (client) result.client = client
  if (typeof search.project === "string" && ID.test(search.project)) result.project = search.project
  return result
}

export function hasTaskFilters(filters: TaskFilters) {
  return Boolean(
    filters.q?.trim() ||
      filters.status ||
      filters.priority ||
      filters.person ||
      filters.label ||
      filters.type ||
      filters.due ||
      filters.client ||
      filters.project
  )
}

export function filterTasks<T extends Filterable>(tasks: T[], filters: TaskFilters, now = new Date()): T[] {
  const today = todayKey(now)
  const words = (filters.q ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean)
  return tasks.filter((task) => {
    if (filters.status && task.status !== filters.status) return false
    if (filters.priority && task.priority !== filters.priority) return false
    if (filters.person) {
      const id = task.assignee?.id ?? NOBODY_FILTER
      if (id !== filters.person) return false
    }
    if (filters.label && !task.labels.some((label) => label.id === filters.label)) return false
    if (filters.type && task.type?.id !== filters.type) return false
    if (filters.due && !matchesDue(task, filters.due, today, now)) return false
    if (filters.client && !matchesClient(task.projectClient, filters.client)) return false
    if (filters.project && task.projectId !== filters.project) return false
    if (words.length) {
      const haystack = `${task.title}\n${task.notesText}`.toLowerCase()
      if (!words.every((word) => haystack.includes(word))) return false
    }
    return true
  })
}

function matchesDue(task: Filterable, due: DueFilter, today: string, now: Date) {
  const day = dueDayOf({ dueDate: task.dueDate ?? null, dueAt: task.dueAt })
  if (due === "none") return !day
  if (!day) return false
  if (due === "overdue") return isOverdue(task.dueDate ?? null, task.status, task.dueAt ?? null, now)
  if (due === "today") return day === today
  if (due === "week") return day >= today && day <= addDays(today, 6)
  return day > addDays(today, 6) && day <= addDays(today, 13)
}

/**
 * Done tasks finished in the last 14 days, and the older ones the Board keeps
 * behind "Show older". A task Done before the finish date was kept has none,
 * so it counts as older.
 */
export function splitRecentDone<T extends { completedAt: string | null }>(
  tasks: T[],
  now: Date
): { recent: T[]; older: T[] } {
  const cutoff = now.getTime() - DONE_RECENT_DAYS * 24 * 60 * 60 * 1000
  const recent: T[] = []
  const older: T[] = []
  for (const task of tasks) {
    if (task.completedAt && new Date(task.completedAt).getTime() >= cutoff) recent.push(task)
    else older.push(task)
  }
  return { recent, older }
}

export const DUE_GROUPS = [
  { key: "waiting", label: "Waiting for my answer" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "none", label: "No date" },
] as const
type DueGroup = (typeof DUE_GROUPS)[number]["key"]

/**
 * Where an open task sits on My dashboard's List. `today` is the person's own day, as
 * in the check-in. "This week" is the next seven days after today.
 */
export function dueGroupOf(
  task: { waiting: boolean; dueDate: string | null; dueAt?: string | null },
  today: string,
  now = new Date()
): DueGroup {
  if (task.waiting) return "waiting"
  const day = dueDayOf(task)
  if (!day) return "none"
  // A "Due by" time that has passed is overdue on its own day too.
  if (day < today || (task.dueAt && new Date(task.dueAt) < now)) return "overdue"
  if (day === today) return "today"
  if (day <= addDays(today, 7)) return "week"
  return "later"
}
