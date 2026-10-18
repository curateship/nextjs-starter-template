/**
 * What a program's dashboard keeps in its address, so a link, a bell notice
 * or a reload opens the same view, weekday and picked item.
 *
 * - `view`: the middle panel's tab. Unset means Day.
 * - `day`: the weekday the Day view shows, 0 = Sunday. Unset means today's.
 * - `pick`: what is open in the right panel. Its kind follows the view: an
 *   exercise in the day, a calendar date, a workout, a lift or a photo day.
 * - `workout`: a workout being logged. While it is set, the middle panel is
 *   the live workout and the right panel its current exercise.
 * - `compare`: two photo days side by side, "idA,idB".
 */

export const PROGRAM_VIEWS = ["day", "calendar", "history", "progress", "photos"] as const
export type ProgramView = (typeof PROGRAM_VIEWS)[number]

export const PROGRAM_VIEW_LABELS: Record<ProgramView, string> = {
  day: "Day",
  calendar: "Calendar",
  history: "History",
  progress: "Progress",
  photos: "Photos",
}

export type ProgramSearch = {
  view?: ProgramView
  day?: number
  pick?: string
  workout?: string
  compare?: string
}

const ID = /^[\w-]{1,36}$/

export function readProgramSearch(search: Record<string, unknown>): ProgramSearch {
  const id = (value: unknown) => (typeof value === "string" && ID.test(value) ? value : undefined)
  const view = (PROGRAM_VIEWS as readonly unknown[]).includes(search.view) ? (search.view as ProgramView) : undefined
  const dayNumber = typeof search.day === "string" ? Number(search.day) : search.day
  const day =
    typeof dayNumber === "number" && Number.isInteger(dayNumber) && dayNumber >= 0 && dayNumber <= 6
      ? dayNumber
      : undefined
  const compare =
    typeof search.compare === "string" && /^[\w-]{1,36},[\w-]{1,36}$/.test(search.compare) ? search.compare : undefined
  const result: ProgramSearch = { view, day, pick: id(search.pick), workout: id(search.workout), compare }
  for (const key of Object.keys(result) as (keyof ProgramSearch)[]) {
    if (result[key] === undefined) delete result[key]
  }
  return result
}
