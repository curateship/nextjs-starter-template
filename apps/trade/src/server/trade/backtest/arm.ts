import type { CandleInterval } from "@/lib/protocols/contracts"
import type { DcaParams, LadderPlan } from "@/lib/trade/dca"
import { draftDcaLadder } from "@/server/trade/smart-orders"
import type { MarketRules } from "@/server/trade/market-rules"

/**
 * Whether a ladder should go on this coin right now, and what it would be.
 *
 * The QFL rule in one place: a coin with no ladder working gets one the moment
 * a base is confirmed and price has not already fallen under it. Everything
 * that decides that already lives in `draftDcaLadder` — it refuses with
 * `SMART_LADDER_NO_BASE` when there is no level and `SMART_LADDER_UNDER_BASE`
 * when the level has gone — so this asks, and reads a refusal as "not yet".
 *
 * Its own small function on purpose. Switching a flow on for real later needs
 * exactly this decision, and writing it twice is how the tested strategy and
 * the running one stop being the same strategy.
 *
 * A refusal is never an error: most bars, on most coins, the answer is simply
 * no. The reason is handed back so a run can say why nothing ever armed.
 */
export type ArmOutcome =
  | { plan: LadderPlan; refusal: null }
  | { plan: null; refusal: string }

export function armLadder(input: {
  marketKey: string
  params: DcaParams
  interval: CandleInterval
  mark: number
  /** The confirmed base as of this bar, or null when none has. */
  base: number | null
  rules: MarketRules
  roundPx: (px: number) => number
  equity: number
  freeCash: number
  openOrderCount: number
  /** The bar this ladder is being armed on — where its candle watch starts. */
  startedAt: number
  /** The run's own order cap — never the practice wallet's fifty. */
  maxOpenOrders: number
  heldSzi: number | null
  nextOrderId: () => string
}): ArmOutcome {
  try {
    const draft = draftDcaLadder({
      marketKey: input.marketKey,
      params: input.params,
      interval: input.interval,
      // Nothing was clicked in a replay, so the click price is today's price.
      // Only read when the ladder is set to hang off a click rather than a base.
      clickPx: input.mark,
      mark: input.mark,
      base: input.base,
      rules: input.rules,
      roundPx: input.roundPx,
      equity: input.equity,
      freeCash: input.freeCash,
      openOrderCount: input.openOrderCount,
      startedAt: input.startedAt,
      maxOpenOrders: input.maxOpenOrders,
      heldSzi: input.heldSzi,
      nextOrderId: input.nextOrderId,
    })
    return { plan: draft.plan, refusal: null }
  } catch (error) {
    return {
      plan: null,
      refusal: error instanceof Error ? error.message : "SMART_LADDER_REFUSED",
    }
  }
}
