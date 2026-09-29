/**
 * The two kinds of front page row this app adds to the shell's builder, and the
 * one field each of them holds.
 *
 * Shared by the panel that edits a row, the component that draws it and the
 * reader that fills it, so the floor an admin typed is read the same way in all
 * three places.
 *
 * Both rows publish a figure to people who are not members. That is the whole
 * point of them and it is also the risk: on a quiet week a true number argues
 * against the product. So each row carries a floor, and a row under its floor is
 * left off the page entirely rather than rounded up into something untrue.
 * Tyler's call on 29 Sep 2026, out of hiding it, a floor it rounds up to, and
 * always showing the real number.
 */

export const POMODORO_ROW_KEYS = ["focus-hours", "open-rooms"] as const

export type PomodoroRowKey = (typeof POMODORO_ROW_KEYS)[number]

export const POMODORO_ROW_LABELS: Record<PomodoroRowKey, string> = {
  "focus-hours": "Hours focused",
  "open-rooms": "Rooms running now",
}

export const POMODORO_ROW_HINTS: Record<PomodoroRowKey, string> = {
  "focus-hours":
    "How many hours everybody focused in the last seven days. Names nobody.",
  "open-rooms": "How many focus rooms are open right now. Names nobody.",
}

/** What the floor box is called. The same question on both rows, so one label. */
export const POMODORO_ROW_FLOOR_LABEL = "Hide the row below"

/** The line under that box, which is the part that differs between the rows. */
export const POMODORO_ROW_FLOOR_HINTS: Record<PomodoroRowKey, string> = {
  "focus-hours":
    "A week quieter than this many hours leaves the row off the page, rather than publishing a figure that reads as nobody using it.",
  "open-rooms":
    "The row is left off the page when fewer than this many rooms are open. One means it appears whenever anybody is in a room.",
}

export const POMODORO_ROW_FLOOR_UNITS: Record<PomodoroRowKey, string> = {
  "focus-hours": "hours",
  "open-rooms": "rooms",
}

/** The floor a row starts with when it is first added. */
export const POMODORO_ROW_DEFAULT_FLOORS: Record<PomodoroRowKey, number> = {
  "focus-hours": 20,
  "open-rooms": 1,
}

export const POMODORO_ROW_FLOOR_MIN = 0
export const POMODORO_ROW_FLOOR_MAX = 100_000

export type PomodoroRowSettings = {
  floor: number
}

/**
 * A row's saved fields, made safe to read.
 *
 * Settings are values an admin typed and the shell stored without reading them,
 * so a row saved before the floor existed, or hand-edited, still opens and still
 * draws. Anything that is not a whole number in range becomes the default.
 */
export function cleanPomodoroRowSettings(
  key: PomodoroRowKey,
  settings: Record<string, unknown> | undefined
): PomodoroRowSettings {
  const raw = settings?.floor
  const floor = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : NaN
  if (
    Number.isNaN(floor) ||
    floor < POMODORO_ROW_FLOOR_MIN ||
    floor > POMODORO_ROW_FLOOR_MAX
  )
    return { floor: POMODORO_ROW_DEFAULT_FLOORS[key] }
  return { floor }
}

/** What a filled row hands the component that draws it. */
export type FocusHoursRowData = {
  hours: number
  /** How many focus sessions those hours came from. */
  sessions: number
}

export type OpenRoomsRowData = {
  rooms: number
}
