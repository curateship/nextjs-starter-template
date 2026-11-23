import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import type { PhotoSession } from "@/lib/api/fitness/photos"
import type { HistoryRow } from "@/lib/api/fitness/workouts"
import { filterHistory } from "@/lib/fitness/history-filters"

/**
 * The rows each view's middle panel lists, in the order it lists them. The
 * views draw from these, and the dashboard reads the same ids to open the
 * first row on arrival, so the two can never disagree about which row is
 * first.
 */

/** This program's workouts, newest first. Older ones with no program show in none. */
export function programRows({ page }: Pick<ProgramViewProps, "page">): HistoryRow[] {
  if (page.viewData.view !== "history") return []
  return page.viewData.history.rows.filter((row) => row.programId === page.program.id)
}

/** The workouts the address's search and filters leave, newest first. */
export function shownHistory(props: Pick<ProgramViewProps, "page" | "search">) {
  return filterHistory(programRows(props), props.search)
}

/** The person's lifts of this program's routine type only: a program never lists another type's lifts. */
export function ownRecords(page: ProgramViewProps["page"]) {
  if (page.viewData.view !== "progress") return []
  return page.viewData.progress.records.filter((record) => record.routineType === page.program.routineType)
}

export function newestFirst(sessions: readonly PhotoSession[]) {
  return [...sessions].sort((a, b) => b.day.localeCompare(a.day))
}
