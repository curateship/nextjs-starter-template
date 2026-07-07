/** Pure helpers for strategy defaults/templates config editing. */

/**
 * Convert a fee percent (e.g. 0.045) to basis points, rounded to 3 decimals so
 * float noise like 0.029 * 100 = 2.9000000000000004 doesn't leak into the UI or
 * the stored config.
 */
export function pctToBps(pct: number): number {
  return Math.round(pct * 100 * 1000) / 1000
}

/**
 * A "<base> copy" name that doesn't collide with any existing template name,
 * incrementing to "copy 2", "copy 3", … as needed.
 */
export function uniqueCopyName(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing)
  let candidate = `${base} copy`
  let n = 2
  while (taken.has(candidate)) candidate = `${base} copy ${n++}`
  return candidate
}
