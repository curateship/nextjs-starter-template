/**
 * How much a figure moved, for the badge beside it.
 *
 * Lives here rather than in one dashboard because the Membership page and the
 * Overview both draw the same badge, and two copies of "what counts as up"
 * would eventually disagree.
 */

export type Change = { percent: number; up: boolean }

/** Null when there is nothing to compare against — never a made-up 0%. */
export function percentChange(before: number, after: number): Change | null {
  if (!before) return null
  const percent = ((after - before) / before) * 100
  return { percent: Math.abs(percent), up: after >= before }
}
