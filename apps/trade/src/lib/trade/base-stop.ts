import {
  MAX_BASE_STOP_RECLAIM_DAYS,
  MAX_BASE_STOP_UNDER_PCT,
} from "@/lib/trade/dca"

/**
 * What the two base-stop boxes will and will not accept, one rule per box, and
 * the sentence each gives back when it refuses.
 *
 * Three windows ask for these two numbers — the ladder window, the grid window
 * and the one that edits a live ladder's exits — and each used to carry its own
 * copy of the rule, judging the pair together. Together was enough to grey Save
 * out and not enough to point at the box at fault, and three copies of a limit
 * is a limit that drifts. The limits themselves come from `dca.ts`, which is
 * what the server checks against.
 *
 * An empty box reads as zero, exactly as it always has — `Number("")` is 0, and
 * zero is a real answer for both of these.
 */

export function badBaseUnderPct(underPct: string): boolean {
  const typed = Number(underPct)
  return !(
    Number.isFinite(typed) &&
    typed >= 0 &&
    typed <= MAX_BASE_STOP_UNDER_PCT
  )
}

export function badBaseReclaimDays(reclaimDays: string): boolean {
  const typed = Number(reclaimDays)
  return !(
    Number.isFinite(typed) &&
    typed >= 0 &&
    typed <= MAX_BASE_STOP_RECLAIM_DAYS
  )
}

export const BASE_STOP_UNDER_REFUSAL = `Percent under the base has to be between 0 and ${MAX_BASE_STOP_UNDER_PCT}. At 0 the stop rests on the base itself.`

export const BASE_STOP_DAYS_REFUSAL = `Buy back after (days) has to be between 0 and ${MAX_BASE_STOP_RECLAIM_DAYS}. At 0 nothing is bought back.`
