import { z } from "zod"

/** One rung of a DCA buy ladder. */
export type AutomationDcaRung = {
  /** How far below the fed base this buy rests, in percent (5 = 5% under). */
  deviation: number
  /** This rung's size as a percent; 100 = one base unit. */
  size: number
}

/** Default ladder: five rungs, every 3% deeper, equal size. */
export const DEFAULT_DCA_RUNGS: AutomationDcaRung[] = [
  { deviation: 5, size: 100 },
  { deviation: 8, size: 100 },
  { deviation: 11, size: 100 },
  { deviation: 14, size: 100 },
  { deviation: 17, size: 100 },
]

/** Most of the account the whole ladder may ever hold, in percent. */
export const DEFAULT_DCA_MAX_POSITION_PCT = 25

export const dcaRungSchema = z.object({
  deviation: z.number().positive().max(99),
  size: z.number().positive().max(10_000),
})

export const dcaRungsSchema = z.array(dcaRungSchema).min(1).max(20)

/** Rung buy prices: each `deviation`% below the fed base. */
export function dcaLevels(base: number, rungs: AutomationDcaRung[]): number[] {
  return rungs.map((rung) => base * (1 - rung.deviation / 100))
}

/**
 * Each rung's share of the account, in percent: the max position split across
 * rungs by their Size weight. The shares sum to `maxPositionPct`.
 */
export function dcaAllocationPcts(
  rungs: AutomationDcaRung[],
  maxPositionPct: number
): number[] {
  const total = rungs.reduce((sum, rung) => sum + rung.size, 0)
  if (!(total > 0)) return rungs.map(() => 0)
  return rungs.map((rung) => (maxPositionPct * rung.size) / total)
}
