import type { DayInfo } from "@/lib/travel/rules"

/** The trip's per-day description, always exactly one entry per day. */
export function readDayInfo(trip: { days: number; dayInfo: DayInfo[] }): DayInfo[] {
  return Array.from({ length: trip.days }, (_, index) => ({ note: trip.dayInfo[index]?.note ?? "" }))
}
