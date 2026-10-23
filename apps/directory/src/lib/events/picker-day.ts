import { format } from "date-fns"

/**
 * The shared date picker works in `Date`s and events work in "2026-10-03"
 * days. The picker shows the browser's calendar, so both directions read the
 * day in local time and a picked 3 Oct is always "2026-10-03".
 */

/** "2026-10-03" for a picked day, or "" when the picker was cleared. */
export function dayFromPicker(date: Date | undefined): string {
  return date ? format(date, "yyyy-MM-dd") : ""
}

/** The picker's value for a "2026-10-03" day, or nothing for no day. */
export function dayForPicker(day: string | null | undefined): Date | undefined {
  if (!day) return undefined
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}
