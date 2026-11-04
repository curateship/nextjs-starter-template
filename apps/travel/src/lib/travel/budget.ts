/**
 * The trip's money (task part 28). Every cost is in the trip's one currency.
 * The trip's total counts the activities on its days; Ideas aren't planned
 * yet, so their costs are listed apart and left out. A stay of several
 * nights carries its whole cost on its first day, so it counts once.
 */
export function tripTotals(
  days: number,
  activities: readonly { day: number | null; costCents: number | null; typeId?: string | null }[]
) {
  const perDay = Array.from({ length: days }, () => 0)
  // More Travel features part 13 (Tyler: "Switch: day or type"): the same costs by activity type. No type is "".
  const perType = new Map<string, number>()
  let ideas = 0
  for (const activity of activities) {
    if (activity.costCents === null) continue
    if (activity.day === null || activity.day > days) {
      ideas += activity.costCents
      continue
    }
    perDay[activity.day - 1] += activity.costCents
    const type = activity.typeId ?? ""
    perType.set(type, (perType.get(type) ?? 0) + activity.costCents)
  }
  const total = perDay.reduce((sum, value) => sum + value, 0)
  return { total, perDay, perType, ideas }
}

/**
 * The trip's costs by activity type, biggest first, as rows to show. A card
 * with no type, or one whose type was removed, counts under Other, with the
 * person's own Other when they still have it.
 */
export function spendingByType<T extends { id: string; builtin: string | null }>(
  perType: ReadonlyMap<string, number>,
  types: readonly T[]
): { type: T | null; cents: number }[] {
  const byId = new Map(types.map((type) => [type.id, type]))
  const other = types.find((type) => type.builtin === "other") ?? null
  const totals = new Map<string, { type: T | null; cents: number }>()
  for (const [typeId, cents] of perType) {
    const type = byId.get(typeId) ?? other
    const key = type?.id ?? ""
    const was = totals.get(key)
    totals.set(key, { type, cents: (was?.cents ?? 0) + cents })
  }
  return [...totals.values()].filter((row) => row.cents > 0).sort((a, b) => b.cents - a.cents)
}
