import { daysBetween, todayIn } from "@/lib/travel/dates"

/**
 * The red line on a Must do card still in Ideas once the trip has started
 * (More Travel features part 4; Tyler: "Warn if left in Ideas"), or null.
 * A trip with no start date never warns, since nothing says it has started.
 */
export function mustDoWarning(
  card: { mustDo: boolean; day: number | null },
  trip: { startDate: string | null; timeZone: string | null },
  at: Date = new Date()
) {
  if (!card.mustDo || card.day !== null || !trip.startDate) return null
  return daysBetween(trip.startDate, todayIn(trip.timeZone, at)) >= 0 ? "Must do, not on a day yet" : null
}
