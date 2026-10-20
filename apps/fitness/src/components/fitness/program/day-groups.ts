import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import type { Exercise } from "@/lib/api/fitness/exercises"
import type { DayExercise, WeekDay } from "@/lib/api/fitness/programs"
import { addDays, formatDay, weekOrder, weekStart, type Day } from "@/lib/fitness/dates"
import { orderByBodyPart, type BodyPartGroup } from "@/lib/fitness/day-order"

export { groupedIds } from "@/lib/fitness/day-order"
export type DayGroup = BodyPartGroup<DayExercise>

/** A day's exercises under their body parts, by the same rule the server saves them in (`day-order.ts`). */
export function groupByBodyPart(rows: readonly DayExercise[], library: ReadonlyMap<string, Exercise>): DayGroup[] {
  return orderByBodyPart(rows, (exerciseId) => library.get(exerciseId)?.muscles ?? [])
}

/** The date a weekday falls on in the week holding `today`, Monday to Sunday. */
export function dateThisWeek(today: Day, weekday: number): Day {
  return addDays(weekStart(today), weekOrder(weekday))
}

/** The quiet line under the day's name: "Tue, Oct 20 · 7 exercises · 24 sets", the date being this week's. */
export function dayLine(page: ProgramViewProps["page"], weekday: number, day: WeekDay | null) {
  const parts: string[] = [formatDay(dateThisWeek(page.today, weekday))]
  if (day) {
    const sets = day.exercises.reduce((sum, row) => sum + row.sets, 0)
    parts.push(`${day.exercises.length} ${day.exercises.length === 1 ? "exercise" : "exercises"}`)
    if (sets) parts.push(`${sets} ${sets === 1 ? "set" : "sets"}`)
  }
  return parts.join(" · ")
}
