import { bodyPartOf, type BodyPart } from "@/lib/fitness/exercise-catalog"

type Row = { id: string; exerciseId: string; groupKey: string | null }

export type BodyPartGroup<R extends Row> = { part: BodyPart; rows: R[] }

/**
 * The one order a day's exercises are in, shown, saved and run (Tyler, 20 Oct
 * 2026, the Day view grouped by body part): each body part where its first
 * exercise comes in the day, and its exercises in their own order. A lift's
 * body part comes from its main muscle (`bodyPartOf`).
 *
 * A superset stays together, filed under its first lift's body part, so a
 * bench press and row superset sits under Chest as one run and its rest still
 * comes after the last of them.
 */
export function orderByBodyPart<R extends Row>(
  rows: readonly R[],
  musclesOf: (exerciseId: string) => readonly string[]
): BodyPartGroup<R>[] {
  const units: R[][] = []
  const bySuperset = new Map<string, R[]>()
  for (const row of rows) {
    const together = row.groupKey ? bySuperset.get(row.groupKey) : undefined
    if (together) {
      together.push(row)
      continue
    }
    const unit = [row]
    if (row.groupKey) bySuperset.set(row.groupKey, unit)
    units.push(unit)
  }
  const groups: BodyPartGroup<R>[] = []
  for (const unit of units) {
    const part = bodyPartOf(musclesOf(unit[0].exerciseId))
    const group = groups.find((entry) => entry.part === part)
    if (group) group.rows.push(...unit)
    else groups.push({ part, rows: [...unit] })
  }
  return groups
}

/** The groups' rows top to bottom, as ids. */
export function groupedIds<R extends Row>(groups: readonly BodyPartGroup<R>[]) {
  return groups.flatMap((group) => group.rows.map((row) => row.id))
}
