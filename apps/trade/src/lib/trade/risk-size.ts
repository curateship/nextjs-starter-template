/**
 * Sizing a trade by what it can lose rather than by what it costs.
 *
 * **The size falls out of the stop.** You say how much of the wallet you are
 * willing to lose — a percent of everything it is worth — and where you get
 * out, and the amount to buy is whatever makes those two true. A stop close to
 * the price buys more; a stop far away buys less; the loss if it hits is the
 * same either way, which is the whole point of saying it this way round.
 *
 * Nothing here reads a clock, a database or an exchange, so every figure below
 * can be checked in a test rather than by placing an order.
 */

/** What one trade would lose, in dollars, if its stop hit exactly. */
export function riskUsdOf(equity: number, riskPct: number): number {
  if (!(equity > 0) || !(riskPct > 0)) return 0
  // A hundred percent is the whole wallet on one trade. Nothing above it means
  // anything, so it is the ceiling rather than a refusal.
  return (equity * Math.min(riskPct, 100)) / 100
}

/**
 * How much of the coin to buy so that being stopped out loses exactly that.
 *
 * Zero when the stop is at or through the entry: there is no distance to
 * divide by, and a stop on the wrong side of the price is not a stop.
 */
export function coinsForRisk(input: {
  equity: number
  riskPct: number
  entryPx: number
  stopPx: number
}): number {
  const risk = riskUsdOf(input.equity, input.riskPct)
  const away = Math.abs(input.entryPx - input.stopPx)
  if (risk <= 0 || !(away > 0) || !(input.entryPx > 0)) return 0
  return risk / away
}

/**
 * The same trade after its stop is dragged: the amount changes, the money at
 * risk does not.
 *
 * Worked out from the order in front of you rather than from a remembered
 * setting, so it holds whatever the order was placed with — a risk percent, or
 * a size somebody typed. Moving a stop further away halves the amount rather
 * than doubling what is at stake, which is what makes dragging it safe.
 */
export function resizeForStop(input: {
  entryPx: number
  /** Where the stop was when the order was placed. */
  fromStopPx: number
  /** Where it has been dragged to. */
  toStopPx: number
  /** The order's size now. */
  sz: number
}): number {
  const was = Math.abs(input.entryPx - input.fromStopPx)
  const now = Math.abs(input.entryPx - input.toStopPx)
  if (!(was > 0) || !(now > 0) || !(input.sz > 0)) return input.sz
  return (input.sz * was) / now
}

/**
 * The most of a coin an order can afford, given the cash free and how much of
 * it may be borrowed against.
 *
 * Risk sizing answers "how much may I lose"; it says nothing about whether the
 * account can pay for the position that answer asks for. A stop half a percent
 * away turns a 1% risk into a position twenty times the wallet, and the
 * exchange refuses it — better to say so in the window than to be told after
 * pressing the button.
 */
export function affordableCoins(input: {
  free: number
  leverage: number
  entryPx: number
}): number {
  if (!(input.free > 0) || !(input.entryPx > 0)) return 0
  return (input.free * Math.max(1, input.leverage)) / input.entryPx
}
