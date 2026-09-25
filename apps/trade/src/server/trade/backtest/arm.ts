import type { CandleInterval } from "@/lib/protocols/contracts"
import type { DcaParams, LadderPlan } from "@/lib/trade/dca"
import { draftDcaLadder } from "@/server/trade/smart-orders"
import type { MarketRules } from "@/server/trade/market-rules"

/**
 * Whether a ladder should go on this coin right now, and what it would be.
 *
 * The QFL rule in one place: a coin with no ladder working gets one the moment
 * a base is confirmed. Everything that decides that already lives in
 * `draftDcaLadder` — it refuses with `SMART_LADDER_NO_BASE` when there is no
 * level and `SMART_LADDER_ABOVE_MARKET` when every rung is above today's price
 * — so this asks, and reads a refusal as "not yet".
 *
 * Price being under the base is deliberately NOT a refusal. It was until
 * 18 August 2026, and it skipped coins whose rungs were all still far below
 * the market. Runs measured before that date armed fewer ladders than the same
 * settings would arm now, so they cannot be compared with runs made after.
 *
 * Its own small function on purpose. Switching a flow on for real later needs
 * exactly this decision, and writing it twice is how the tested strategy and
 * the running one stop being the same strategy.
 *
 * A refusal is never an error: most bars, on most coins, the answer is simply
 * no. The reason is handed back so a run can say why nothing ever armed.
 */
export type ArmOutcome =
  { plan: LadderPlan; refusal: null } | { plan: null; refusal: string }

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
  /** The bar this ladder is being armed on — where its candle watch starts. */
  startedAt: number
  /** How many orders the replay's book already holds, against its own cap. */
  openOrderCount: number
  /** The run's own order cap — never the practice wallet's fifty. */
  maxOpenOrders: number
  heldSzi: number | null
  /**
   * Where an order id comes from. Injected so a replay can count instead of
   * rolling a dice — nothing inside a run may read a random number, or two
   * identical runs stop being identical.
   */
  nextOrderId: () => string
}): ArmOutcome {
  try {
    const draft = draftDcaLadder({
      marketKey: input.marketKey,
      // Buying rung 1 now belongs to the hand-placement window. A replay has
      // no placement click in real time and keeps its existing rung model.
      params: { ...input.params, marketBuyFirst: false },
      interval: input.interval,
      // Nothing was clicked in a replay, so the click price is today's price.
      // Only read when the ladder is set to hang off a click rather than a base.
      clickPx: input.mark,
      mark: input.mark,
      base: input.base,
      rules: input.rules,
      roundPx: input.roundPx,
      equity: input.equity,
      startedAt: input.startedAt,
      heldSzi: input.heldSzi,
    })

    // The replay models each rung as an order on its own book — wick fills.
    //
    // **Live rungs are triggers; a replay's bars cannot be.** The live engine
    // watches the actual price and fires a rung the moment it is crossed. A
    // replay only has candles, and the honest model of "fired when crossed"
    // inside a bar is the book fill the bar's wick trades through: every
    // crossed rung buys, at its own level, with its exit able to fill on the
    // same bar's bounce. That is the model every measured run was measured on.
    // Two-green keeps its candle watch — confirmation is candle-based in both
    // worlds, so there is nothing to translate.
    if (!input.params.twoGreen) {
      const waiting = draft.plan.rungs.filter(
        (rung) => rung.status === "waiting"
      )
      if (input.openOrderCount + waiting.length > input.maxOpenOrders) {
        return { plan: null, refusal: "PAPER_ORDER_LIMIT" }
      }
      draft.plan.rungEntry = "limit"
      draft.plan.greenInterval = null
      for (const rung of waiting) {
        rung.orderId = input.nextOrderId()
      }
    }
    return { plan: draft.plan, refusal: null }
  } catch (error) {
    return {
      plan: null,
      refusal: error instanceof Error ? error.message : "SMART_LADDER_REFUSED",
    }
  }
}
