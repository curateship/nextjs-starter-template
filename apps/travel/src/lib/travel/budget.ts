/**
 * The trip's money (task part 28). Every cost is in the trip's one currency.
 * The trip's total counts the activities on its days; Ideas aren't planned
 * yet, so their costs are listed apart and left out. A stay of several
 * nights carries its whole cost on its first day, so it counts once.
 */
export function tripTotals(
  days: number,
  activities: readonly { day: number | null; costCents: number | null }[]
) {
  const perDay = Array.from({ length: days }, () => 0)
  let ideas = 0
  for (const activity of activities) {
    if (activity.costCents === null) continue
    if (activity.day === null || activity.day > days) ideas += activity.costCents
    else perDay[activity.day - 1] += activity.costCents
  }
  const total = perDay.reduce((sum, value) => sum + value, 0)
  return { total, perDay, ideas }
}
