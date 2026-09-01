/**
 * A stop and a target written as a distance from the price the trade gets in
 * at, rather than as two prices.
 *
 * That is how the decision is actually made — "I'll risk two percent to make
 * five" — and a percentage means the same thing on a $118,000 coin as on a
 * $0.02 one. Every percent-based stop and target uses this arithmetic, so it
 * lives here once instead of three times.
 *
 * Which way a percentage moves the price depends on two things at once: which
 * way the trade is pointing, and which of the two lines is being worked out. A
 * long's target is above its entry and its stop below; on a short they swap.
 */

/** From a price back to the distance it sits at, for filling a box in. */
export function bracketPercent(entryPx: number, px: number | null): string {
  if (px === null || !(entryPx > 0)) return ""
  return String(Number(((Math.abs(px - entryPx) / entryPx) * 100).toFixed(4)))
}

/**
 * The price a typed distance works out to, or null when it is not one: empty,
 * not a number, not positive, or far enough the wrong way to take the price
 * through zero.
 *
 * Judged on the price itself rather than on the percentage, because which side
 * can go through zero depends on the direction of the trade — a rule of "under
 * a hundred" refuses good numbers on one side and lets impossible ones through
 * on the other.
 */
export function bracketPrice(input: {
  entryPx: number
  /** What was typed in the box. */
  percent: string
  /** The trade this belongs to is a long. */
  long: boolean
  /** The winning side — the target — rather than the stop. */
  winning: boolean
}): number | null {
  const typed = input.percent.trim()
  const withoutSign = typed.endsWith("%") ? typed.slice(0, -1).trim() : typed
  const percent = Number(withoutSign)
  if (withoutSign === "" || !Number.isFinite(percent) || percent <= 0) {
    return null
  }
  const up = input.winning === input.long
  const px = input.entryPx * (up ? 1 + percent / 100 : 1 - percent / 100)
  return px > 0 ? px : null
}

/**
 * Reads an exact stop price and keeps it only when it is on the losing side of
 * the entry. A long loses below its entry; a short loses above it.
 */
export function absoluteStopPrice(input: {
  entryPx: number
  price: string
  long: boolean
}): number | null {
  const typed = input.price.trim()
  const price = Number(typed)
  if (typed === "" || !Number.isFinite(price) || price <= 0) return null
  const losing = input.long ? price < input.entryPx : price > input.entryPx
  return losing ? price : null
}

/** Something was typed in the box and it does not work out to a price. */
export function bracketTyped(percent: string, px: number | null): boolean {
  return percent.trim() !== "" && px === null
}
