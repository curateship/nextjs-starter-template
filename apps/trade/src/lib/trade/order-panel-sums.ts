/**
 * The two sums under the Grid, DCA and Manual orders tables. See
 * `components/trade/order-panel-totals.tsx` for the row that prints them.
 */

/** Every value added up, or null the moment one row has none. */
export function sumValues(values: readonly (number | null)[]): number | null {
  let total = 0
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) return null
    total += value
  }
  return total
}

/**
 * The profits that exist, added up, or null when none exists. A row with no
 * profit is a trade that has not started, not a missing figure.
 */
export function sumProfits(values: readonly (number | null)[]): number | null {
  const known = values.filter(
    (value): value is number => value !== null && Number.isFinite(value)
  )
  if (known.length === 0) return null
  return known.reduce((total, value) => total + value, 0)
}
