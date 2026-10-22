import { bodyPartOf, type BodyPart } from "@/lib/fitness/exercise-catalog"

/**
 * The missing muscle warning on Progress (Tyler, 21 Oct 2026: "When the rest
 * of the week won't cover it"). A body part that usually gets 4 or more
 * working sets a week, with none so far this week and none in this week's
 * planned workouts still to come, is named: "No leg sets this week, and none
 * planned." Body parts are the Day view's, worked out from each lift's main
 * muscle, so "leg" means the same everywhere.
 */

/** A body part needs this many sets in a typical week before its absence is worth a line. */
export const USUAL_SETS = 4

/** The weeks of history a typical week needs before any warning shows. */
const WEEKS_NEEDED = 2

export function missingBodyParts({
  weeks,
  plannedMuscles,
}: {
  /** Working sets per main muscle, one entry per week, this week last. */
  weeks: readonly { sets: Record<string, number> }[]
  /** The main muscle of every lift in this week's planned workouts from today on. */
  plannedMuscles: readonly string[]
}): BodyPart[] {
  const thisWeek = weeks[weeks.length - 1]
  const earlier = weeks.slice(0, -1)
  if (!thisWeek || earlier.filter((week) => Object.keys(week.sets).length > 0).length < WEEKS_NEEDED) return []
  const perPart = (sets: Record<string, number>) => {
    const totals = new Map<BodyPart, number>()
    for (const [muscle, count] of Object.entries(sets)) {
      const part = bodyPartOf([muscle])
      totals.set(part, (totals.get(part) ?? 0) + count)
    }
    return totals
  }
  const done = perPart(thisWeek.sets)
  const usual = new Map<BodyPart, number>()
  for (const week of earlier) {
    for (const [part, count] of perPart(week.sets)) usual.set(part, (usual.get(part) ?? 0) + count)
  }
  const planned = new Set(plannedMuscles.map((muscle) => bodyPartOf([muscle])))
  return [...usual.entries()]
    .filter(([part, total]) => part !== "other" && total / earlier.length >= USUAL_SETS)
    .filter(([part]) => !done.get(part) && !planned.has(part))
    .sort((a, b) => b[1] - a[1])
    .map(([part]) => part)
}

/** How a body part reads before "sets": "leg sets", "shoulder sets". */
const SET_WORD: Record<BodyPart, string> = {
  chest: "chest",
  back: "back",
  shoulders: "shoulder",
  arms: "arm",
  core: "core",
  legs: "leg",
  other: "other",
}

/** "No leg sets this week, and none planned." or, for several, one line naming them all. */
export function missingLine(parts: readonly BodyPart[]): string | null {
  if (parts.length === 0) return null
  const names = parts.map((part) => SET_WORD[part])
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`
  return `No ${list} sets this week, and none planned.`
}
