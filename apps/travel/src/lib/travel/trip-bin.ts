import { addDays, formatDayDate } from "@/lib/travel/dates"

/** How long a deleted trip waits in the Trips table's bin before it goes for good (Travel features part 8). */
export const TRIP_BIN_DAYS = 30

/**
 * "Goes for good 3 Dec": a binned trip's or place's line, one copy for the
 * Trips table, Places and the right panel (Travel polish part 24).
 */
export function binGoesLine(deletedAt: string) {
  const gone = formatDayDate(addDays(deletedAt.slice(0, 10), TRIP_BIN_DAYS))
  return `Goes for good ${gone.split(" ").slice(1).join(" ")}`
}
