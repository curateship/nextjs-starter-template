import { addDays, weekStart, type Day } from "@/lib/fitness/dates"

/**
 * History's search, filters and grouping on a program's dashboard (Tyler,
 * 20 Oct 2026, asked to "Add them" over his 18 Oct list with no search).
 * They live in the address beside the dashboard's own keys, so a link opens
 * the same list, and a saved view holds the same values.
 *
 * - `q`: words found in the workout's name, its exercises or its note.
 * - `name`: one workout name, such as "Chest day".
 * - `status`: finished or unfinished.
 * - `exercise`: one exercise by name, as the rows carry names.
 * - `group`: how the list is split. Unset is by week: This week, Last week,
 *   then the month.
 */
export const HISTORY_STATUSES = ["finished", "unfinished"] as const
export type HistoryStatus = (typeof HISTORY_STATUSES)[number]

export const HISTORY_GROUPS = ["week", "month", "none"] as const
export type HistoryGroup = (typeof HISTORY_GROUPS)[number]

export const HISTORY_GROUP_LABELS: Record<HistoryGroup, string> = {
  week: "Week",
  month: "Month",
  none: "None",
}

export type HistoryFilters = {
  q?: string
  name?: string
  status?: HistoryStatus
  exercise?: string
  group?: HistoryGroup
}

export const HISTORY_FILTER_KEYS = ["q", "name", "status", "exercise", "group"] as const

/** Every History key empty, for clearing them all in one address change. */
export const NO_HISTORY_FILTERS: Record<keyof HistoryFilters, undefined> = {
  q: undefined,
  name: undefined,
  status: undefined,
  exercise: undefined,
  group: undefined,
}

/** The most text a filter value may hold, in the address and in a saved view. */
export const HISTORY_FILTER_MAX = 80

/** Reads the filters out of an address or a saved view, dropping anything malformed. */
export function readHistoryFilters(source: Record<string, unknown>): HistoryFilters {
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() && value.length <= HISTORY_FILTER_MAX ? value : undefined
  const result: HistoryFilters = {
    q: text(source.q),
    name: text(source.name),
    status: (HISTORY_STATUSES as readonly unknown[]).includes(source.status) ? (source.status as HistoryStatus) : undefined,
    exercise: text(source.exercise),
    group: (HISTORY_GROUPS as readonly unknown[]).includes(source.group) ? (source.group as HistoryGroup) : undefined,
  }
  for (const key of HISTORY_FILTER_KEYS) if (result[key] === undefined) delete result[key]
  return result
}

/** How many of the Filter popover's rows are set; the search and Group don't count. */
export function historyFilterCount(filters: HistoryFilters) {
  return [filters.name, filters.status, filters.exercise].filter(Boolean).length
}

type FilterableRow = { name: string; day: Day; finished: boolean; note: string; exerciseNames: string[] }

/** The rows the filters leave, in their own order. */
export function filterHistory<Row extends FilterableRow>(rows: readonly Row[], filters: HistoryFilters): Row[] {
  const words = (filters.q ?? "").toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    if (filters.name && row.name !== filters.name) return false
    if (filters.status && row.finished !== (filters.status === "finished")) return false
    if (filters.exercise && !row.exerciseNames.includes(filters.exercise)) return false
    if (words.length === 0) return true
    const haystack = [row.name, row.note, ...row.exerciseNames].join(" ").toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

const MONTH_LONG = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" })

/** The heading a row sits under: "This week", "Last week", then "September 2026". */
function groupName(day: Day, today: Day, group: HistoryGroup) {
  if (group === "none") return "Workouts"
  if (group === "week") {
    const monday = weekStart(today)
    if (day >= monday) return "This week"
    if (day >= addDays(monday, -7)) return "Last week"
  }
  return MONTH_LONG.format(new Date(`${day}T00:00:00Z`))
}

/** The rows in their groups, newest group first, keeping the rows' own order. */
export function groupHistory<Row extends { day: Day }>(rows: readonly Row[], today: Day, group: HistoryGroup = "week") {
  const groups: { name: string; rows: Row[] }[] = []
  for (const row of rows) {
    const name = groupName(row.day, today, group)
    const last = groups.at(-1)
    if (last?.name === name) last.rows.push(row)
    else groups.push({ name, rows: [row] })
  }
  return groups
}
