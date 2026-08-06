/**
 * How the Trade screens print the figures in a `MarketRow`.
 *
 * One home so a price in the list and the same price in the header can never
 * be formatted two ways. The rows carry plain numbers; every string a person
 * reads is made here.
 */

const PRICE = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 5,
})

/**
 * A price in dollars, at the precision a trader expects: five significant
 * digits, so $67,413 and $142.38 and $0.023411 all read naturally under one
 * rule instead of one rule per size of coin.
 */
export function formatPrice(price: number): string {
  return `$${PRICE.format(price)}`
}

/**
 * Big dollar figures — volume, open interest — said the way traders say
 * them: $1.24b, $88.6m, $532k. Not for prices; a price wants its digits.
 */
export function formatCompactUsd(value: number): string {
  const abs = Math.abs(value)
  const [divisor, suffix] =
    abs >= 1e9 ? [1e9, "b"] : abs >= 1e6 ? [1e6, "m"] : abs >= 1e3 ? [1e3, "k"] : [1, ""]
  const scaled = value / divisor
  const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2
  return `$${scaled.toFixed(digits)}${suffix}`
}

/**
 * A day's move, from the fraction in the row: 0.0241 → "+2.41%". The sign is
 * always shown — in a column of changes, the sign is the reading.
 */
export function formatChange(fraction: number): string {
  const percent = fraction * 100
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`
}

/**
 * An hourly funding rate, from the fraction in the row: 0.0000125 →
 * "0.0013%". Four decimals because funding lives in the fourth one.
 */
export function formatFunding(fraction: number): string {
  return `${(fraction * 100).toFixed(4)}%`
}
