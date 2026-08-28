/**
 * The two sums every exchange that states a step needs, in one place.
 *
 * Some exchanges publish a rule for how fine a price may be (Hyperliquid's
 * five significant figures); others publish a number — this market's tick is
 * 0.5, its size step is 0.001. This file is for the second kind, so that two
 * such exchanges do not each carry their own copy of the same arithmetic.
 *
 * Browser-safe and exchange-blind: no venue is named here, and nothing in it
 * talks to a network.
 */

/**
 * The nearest price the exchange would accept, snapped to the market's tick.
 *
 * The re-rounding at the end is the part that matters. Ticks are decimals, so
 * multiplying a tick count back out reintroduces float dust — 8583 × 0.5
 * comes out as 4291.500000000001 — and an exchange refuses a price string
 * with dust on the end. Rounding to the tick's own precision is exact for
 * every tick a venue actually uses.
 *
 * A null tick means the caller has no number to snap to (an old saved plan
 * from before ticks were carried); the price is left alone, and the exchange
 * refuses it out loud rather than filling somewhere surprising.
 */
export function snapToTick(px: number, tick: number | null): number {
  if (tick === null || !(tick > 0)) return px
  const ticks = Math.round(px / tick)
  return Number((ticks * tick).toFixed(decimalsOf(tick)))
}

/** The shared market adapter for exchanges whose price rule is a tick. */
export function roundToTick(
  px: number,
  _sizeDecimals: number | null,
  priceTick: number | null
): number {
  return snapToTick(px, priceTick)
}

/** How many decimal places a step like 0.001 carries. Capped for safety. */
function decimalsOf(step: number): number {
  // Exponent form ("1e-5") has no visible decimals to count, so the number is
  // asked for its own precision instead of its rendering.
  const text = step.toExponential()
  const exponent = Number(text.slice(text.indexOf("e") + 1))
  const digits = text.slice(0, text.indexOf("e")).replace(/[-.]/g, "").length
  return Math.min(Math.max(digits - 1 - exponent, 0), 12)
}

/**
 * A size step as "how many decimal places a size may have" — the coarse form
 * the shared engine sizes with.
 *
 * Exact for the usual powers of ten. A step that is not one — half a coin, or
 * ten coins at a time — cannot be said in decimal places at all, so it
 * answers 0 and the connector enforces the real step when it places the
 * order. Null in means null out: the exchange did not say.
 */
export function stepToDecimals(step: number | null): number | null {
  if (step === null || !(step > 0)) return null
  const decimals = Math.round(-Math.log10(step))
  const exact = Number((10 ** -decimals).toFixed(12)) === step
  if (!exact) return 0
  return Math.max(0, decimals)
}
