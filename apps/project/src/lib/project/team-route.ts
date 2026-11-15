import { loadTeamCheckins } from "@/lib/api/project/checkins"
import { loadMeetings } from "@/lib/api/project/meetings"
import { loadFigures, loadTeamDashboardPage, loadTeamTaskList } from "@/lib/api/project/teams"
import { readTaskFilters, type TaskFilters } from "@/lib/project/task-filters"
import { isRealDay } from "@/lib/project/days"

export type TeamSearch = TaskFilters & {
  /** "YYYY-MM" shown in the calendar. Left out, the current month. */
  month?: string
  /**
   * "YYYY-MM-DD" chosen on the calendar: its meetings show under it, and its
   * check-ins on the right (today's, for a day still to come). Left out, today.
   */
  day?: string
  /** The task open in the right panel. */
  task?: string
  /**
   * A client's name, or "No client": the calendar's due dates, Workload and
   * the Tasks tab show only that client's projects (Features 16 Oct, part 9).
   */
  client?: string
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const ID = /^[\w-]{1,36}$/

/** A record id from the address, or undefined when it isn't one. */
export function readId(value: unknown) {
  return typeof value === "string" && ID.test(value) ? value : undefined
}

/**
 * The Team dashboard's address, shared by an employee's `/team` and the site
 * admin's `/teams/<id>`: the month and day on the calendar, the open task and
 * the Tasks tab's filters, the client among them.
 */
export function readTeamSearch(search: Record<string, unknown>): TeamSearch {
  const result: TeamSearch = readTaskFilters(search)
  if (typeof search.month === "string" && MONTH.test(search.month)) result.month = search.month
  if (typeof search.day === "string" && isRealDay(search.day)) result.day = search.day
  const task = readId(search.task)
  if (task) result.task = task
  return result
}

/** Opening a task doesn't reload the page; a new month or day does. */
export function teamLoaderDeps(search: Record<string, unknown>) {
  const { month, day } = readTeamSearch(search)
  return { month, day }
}

/** Everything the Team dashboard draws, for one team. An employee's own team needs no `teamId`. */
export async function loadTeamScreen(deps: { month?: string; day?: string }, teamId?: string) {
  const [data, checkins, meetings, figures, tasks] = await Promise.all([
    loadTeamDashboardPage(teamId),
    loadTeamCheckins({ month: deps.month, day: deps.day }, teamId),
    loadMeetings({ month: deps.month, day: deps.day }, teamId),
    loadFigures(teamId),
    loadTeamTaskList(teamId),
  ])
  return { data, checkins, meetings, figures, tasks }
}
