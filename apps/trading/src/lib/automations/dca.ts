import { z } from "zod"

/** One rung of a DCA buy ladder. Sizing is set by the ladder's Size ramp
 * (`sizeMultiplier`), not per rung — a rung only carries its drop depth. */
export type AutomationDcaRung = {
  /**
   * How far below the PREVIOUS buy this rung rests, in percent (the first rung
   * is measured from the base). So 5, 8 means: first buy 5% under the base,
   * second buy a further 8% under the first buy — not 8% under the base.
   */
  deviation: number
}

/** Default ladder: five rungs, every 3% deeper below the buy above. */
export const DEFAULT_DCA_RUNGS: AutomationDcaRung[] = [
  { deviation: 5 },
  { deviation: 8 },
  { deviation: 11 },
  { deviation: 14 },
  { deviation: 17 },
]

/** Most of the account the whole ladder may ever hold, in percent. */
export const DEFAULT_DCA_MAX_POSITION_PCT = 25

/**
 * How much bigger each buy is than the one above it. 1 = every buy equal; 2 =
 * each buy doubles the last (exponential — buy more the deeper it drops). New
 * ladders default to this; configs saved before the field existed load as 1
 * (equal), preserving their behavior.
 */
export const DEFAULT_DCA_SIZE_MULTIPLIER = 2

/**
 * How far UNDER the base the "money back, ride the rest free" take-profit rests
 * its free coins, in percent. Price that has fallen through a level usually
 * stalls just short of reclaiming it, so the runner sells a little below the
 * base rather than exactly on it. Only read by that one take-profit mode.
 */
export const DEFAULT_DCA_SELL_BELOW_BASE_PCT = 2

// A rung only carries its drop depth. Configs saved with an old per-rung `size`
// still load — zod drops the now-unknown key.
export const dcaRungSchema = z.object({
  deviation: z.number().positive().max(99),
})

export const dcaRungsSchema = z.array(dcaRungSchema).min(1).max(20)

/**
 * Rung buy prices. Each rung's `deviation` is measured from the PREVIOUS rung
 * (the first from the base), so the drops compound: base −5% → then −8% of that
 * → then −11% of that, and so on. This spreads the ladder out, rather than
 * bunching every rung a few percent apart under the base.
 */
export function dcaLevels(base: number, rungs: AutomationDcaRung[]): number[] {
  const levels: number[] = []
  let price = base
  for (const rung of rungs) {
    price = price * (1 - rung.deviation / 100)
    levels.push(price)
  }
  return levels
}

/**
 * Each rung's share of the account, in percent. The max position is split
 * across the rungs by an exponential ramp: rung i gets `sizeMultiplier ** i` of
 * the weight, so each buy is `sizeMultiplier`× the one above it (1 = equal, 2 =
 * doubling). The shares always sum to `maxPositionPct`.
 */
export function dcaAllocationPcts(
  rungCount: number,
  maxPositionPct: number,
  sizeMultiplier: number
): number[] {
  const ramp = sizeMultiplier > 0 ? sizeMultiplier : 1
  const weights = Array.from({ length: rungCount }, (_, i) => ramp ** i)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (!(total > 0)) return weights.map(() => 0)
  return weights.map((weight) => (maxPositionPct * weight) / total)
}
