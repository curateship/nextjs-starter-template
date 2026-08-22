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

const USD = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Money someone owns, to the cent: "$9,999.78". Wallet values and the account
 * rows use this — a balance wants its cents, where a price wants its digits.
 */
export function formatUsd(value: number): string {
  return `$${USD.format(value)}`
}

const USD_WHOLE = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

/**
 * Money where the cents stop mattering: "$1,250" above a hundred dollars,
 * "$62.50" below it.
 *
 * For a column of amounts rather than a balance. A ladder's nine buys run from
 * a few cents to a few hundred dollars, and printing "$1,250.00" beside "$0.62"
 * gives four digits of noise to the one that needs none and takes the eye off
 * the shape of the ramp, which is the whole thing being read.
 */
export function formatUsdRounded(value: number): string {
  const size = Math.abs(value)
  // Minus outside the dollar sign, as `formatSignedUsd` has it: "-$1,250"
  // rather than "$-1,250". A buy size is never negative, so this is only here
  // so the rule holds if anything else picks this up.
  const sign = value < 0 ? "-" : ""
  return size >= 100
    ? `${sign}$${USD_WHOLE.format(size)}`
    : `${sign}${formatUsd(size)}`
}

/**
 * A gain or loss, sign always shown: "+$412.65", "-$18.90". In a column of
 * outcomes the sign is the reading, so it is never dropped — except on true
 * zero, which is neither.
 */
export function formatSignedUsd(value: number): string {
  if (value === 0) return "$0.00"
  return `${value > 0 ? "+" : "-"}$${USD.format(Math.abs(value))}`
}

const SIZE = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
})

/**
 * How much of the coin: "0.0125", "1,500".
 *
 * **This is the one that stops arithmetic residue reaching the screen.** A row
 * rarely carries a size somebody typed. It carries dollars divided by a price,
 * or a slice of a position, and division leaves digits that mean nothing —
 * 0.014691048932 of a bitcoin, where the exchange itself only accepts five
 * decimals and will fill 0.01469.
 *
 * Six is deliberately a little past what any market here states rather than
 * exactly what one states, because a row does not carry its market's own
 * precision. If one ever needs to, the market's `sizeDecimals` is the number
 * to pass in, and this becomes its default.
 */
export function formatSize(size: number): string {
  return SIZE.format(size)
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
 * How far one price is from another, as a share of it: 0.0321 → "3.21%".
 *
 * No sign, because the words beside it say which way — "3.21% away" from a
 * level you are waiting under and one you are waiting over read the same, and
 * a plus or a minus there would only invite the wrong reading.
 */
export function formatAway(fraction: number): string {
  return `${(fraction * 100).toFixed(2)}%`
}

/**
 * An hourly funding rate, from the fraction in the row: 0.0000125 →
 * "0.0013%". Four decimals because funding lives in the fourth one.
 */
export function formatFunding(fraction: number): string {
  return `${(fraction * 100).toFixed(4)}%`
}
