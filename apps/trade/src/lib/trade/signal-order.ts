import { z } from "zod"

import { smartOrderPauseFields } from "@/lib/trade/smart-order-pause"

/**
 * One coin being traded on an indicator's say-so.
 *
 * **It is not a ladder and it is not a grid.** There are no levels: an arrow
 * printed, and this is the one position that arrow asked for, from the moment
 * it starts asking for a price to the moment it is out again.
 *
 * ## Nothing here is ever sent at the market price
 *
 * The arrow is a trigger — until it prints, this row does not exist and no
 * money is reserved. Once it prints, the plan asks for a price rather than
 * taking one: it rests a limit order just off the touch and moves it as price
 * moves, which is the whole reason to prefer this over a market order. A market
 * buy pays the spread, the higher fee, and whatever the book does in the
 * moment; a rested one pays none of the three, at the cost of possibly not
 * filling at all.
 *
 * That cost is real and is the setting: a buy follows a price that runs away
 * only so far, then gives up and buys nothing. A sell never gives up, because
 * being half out of a position is worse than any price it would have got.
 *
 * ## Why the position is not counted here
 *
 * The plan does not remember how much it has bought. The book does — for a
 * practice wallet from its own arithmetic, and for a real one from the exchange
 * itself, rebuilt every pass. Keeping a second count here would be a number
 * that can disagree with the position it claims to describe, and a partial fill
 * is exactly when it would.
 */

/**
 * What the plan is doing right now.
 *
 * `stopping` is set from outside — by a flow being switched off — and means
 * "call this off". It exists because cancelling an order is the engine's job in
 * both lanes and only the engine has the wiring for it: a practice wallet drops
 * a row and a real one asks the exchange. Marking the plan and letting the next
 * pass do the cancelling reuses the same path a give-up already takes, rather
 * than writing a second copy of it somewhere that would have to be kept in step.
 */
export const SIGNAL_PHASES = [
  "buying",
  "holding",
  "selling",
  "stopping",
] as const

export const signalPlanSchema = z.object({
  ...smartOrderPauseFields,
  /**
   * The price when the arrow fired, which is what the chase is measured from.
   *
   * Not the price of the candle the arrow sits on — the live price at the
   * moment this row was written. The two are usually near each other and only
   * one of them is the price we could actually have had.
   */
  signalPx: z.number().positive(),
  /** The candle the arrow printed on, so a later pass can tell it apart. */
  signalAt: z.number(),
  /**
   * How far above `signalPx` a buy may follow, as a share of it.
   *
   * Zero means it does not follow at all: the order sits where the arrow was
   * and fills only if price comes back. Frozen at placement, like everything
   * else here, so redrawing the flow never changes a trade already in flight.
   */
  chaseGiveUp: z.number().min(0),
  /** What this coin is allowed to spend, in dollars. */
  stakeUsd: z.number().positive(),
  /** The market's rules, frozen at placement — the engine sizes from these. */
  sizeDecimals: z.number().nullable(),
  /** The market's smallest price step, frozen with the rest. Null: no tick stated. */
  priceTick: z.number().nullable().default(null),
  maxLeverage: z.number().positive(),
  phase: z.enum(SIGNAL_PHASES),
  /** The order resting on the book right now, and where it is resting. */
  orderId: z.string().nullable().default(null),
  orderPx: z.number().positive().nullable().default(null),
  /**
   * When the order first went missing from the exchange's open-orders read,
   * or 0 while it is listed. Read by `judgeOrder`, which will not call an
   * order gone on one absent read — see `src/lib/trade/order-presence.ts`.
   */
  missingSince: z.number().default(0),
  /**
   * How much of this coin the wallet held the moment the order was sent, so
   * a fill can be noticed by the amount held CHANGING rather than by guessing
   * from whether a position happens to exist.
   */
  heldWhenPlaced: z.number().default(0),
  /**
   * When the order was last moved, so a chase cannot re-price faster than the
   * exchange will forgive. See `CHASE_EVERY_MS`.
   */
  chasedAt: z.number().default(0),
  /**
   * How many times it has been moved.
   *
   * Kept because moving an order is the expensive thing this plan does — a
   * cancel and a place against a per-minute allowance — so "how often did it
   * actually move" is the question anybody checking the rate limits will ask.
   */
  chases: z.number().int().min(0).default(0),
  /** When this plan came into existence, in epoch milliseconds. */
  startedAt: z.number().default(0),
})

export type SignalPlan = z.infer<typeof signalPlanSchema>

/**
 * Reads a stored plan back, or null when it cannot be read.
 *
 * Null is always "ignore this row", never "half-obey it" — the same rule every
 * other smart order follows, and for the same reason: a row written by a build
 * that meant something else by these fields has real orders behind it.
 */
export function readSignalPlan(value: unknown): SignalPlan | null {
  const parsed = signalPlanSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * How far off the touch a resting order sits, as a share of the price.
 *
 * It has to be off it: an order priced AT the mark counts as marketable and
 * would be refused by the post-only rule — which is the rule doing its job, not
 * a bug to work around. Small enough to be first in the queue, big enough to
 * survive rounding to the market's own price step.
 */
export const CHASE_OFFSET = 0.0002

/**
 * How far the wanted price must move before the order is worth moving.
 *
 * Without it, a price wobbling in its fourth decimal would cancel and re-place
 * an order every single pass, forever, for no better fill.
 */
export const CHASE_DRIFT = 0.001

/**
 * The soonest one wallet may move an order again — ten seconds.
 *
 * **This is a rate limit, not a preference.** Hyperliquid allows about 1,200
 * weight a minute per address and an order call costs 20 of it, so the whole
 * account gets roughly sixty order calls a minute for everything it does.
 * Moving an order is two of them, cancel and place. One move per wallet per ten
 * seconds is six moves a minute — 240 weight — which leaves the rest of the
 * budget for the trading the flow is actually there to do.
 *
 * A practice wallet waits exactly as long, though it asks nothing of any
 * exchange. A practice run that re-priced ten times more often than the real
 * thing would report fills the real thing could never have got, and the whole
 * point of practising is that it does not.
 */
export const CHASE_EVERY_MS = 10_000

/**
 * The furthest off the touch this will go looking for a price that rests.
 *
 * A coin whose price grid is coarser than this cannot be chased at all, and
 * saying so beats placing an order that is refused every ten seconds forever.
 */
export const CHASE_MAX_OFFSET = 0.02

/**
 * A price that will actually REST, on this market's own price grid.
 *
 * **The offset alone is not enough, and assuming it was is a real bug this
 * caught.** Every exchange rounds an order's price to its own grid, and it
 * rounds to the NEAREST step — so on a coin whose grid is coarser than the
 * offset, a price a whisker under the market rounds straight back onto it. An
 * order priced at the market is a marketable order: the real exchange refuses
 * it outright (that is the post-only rule working), and the practice engine
 * fills it on the spot. Every ten seconds. Forever, on that coin.
 *
 * So the offset is a starting point, not an answer. This steps away from the
 * price — doubling each time — until the ROUNDED price is genuinely on the
 * resting side, and gives up rather than guessing if it never is.
 *
 * Stepping away is always in your favour: further under the market for a buy,
 * further over it for a sell. The cost is a worse place in the queue, never a
 * worse price.
 *
 * Null means this coin cannot be chased. That is a refusal for the caller to
 * report, not a reason to send something that will be turned down.
 */
export function restingChasePx(
  side: "buy" | "sell",
  mark: number,
  roundPx: (px: number) => number
): number | null {
  if (!(mark > 0)) return null
  for (let offset = CHASE_OFFSET; offset <= CHASE_MAX_OFFSET; offset *= 2) {
    const px = roundPx(
      side === "buy" ? mark * (1 - offset) : mark * (1 + offset)
    )
    if (!(px > 0)) continue
    // The exchange's own test, in the app's own words: a buy at or above the
    // market and a sell at or below it are both takeable right now.
    const marketable = side === "buy" ? px >= mark : px <= mark
    if (!marketable) return px
  }
  return null
}

/**
 * The most a buy may ever pay, worked out from where the arrow was.
 *
 * The whole reason a buy chase has an end: an arrow says a floor formed, and
 * following price a long way up from there is buying something the arrow never
 * pointed at.
 */
export function chaseCeilingPx(plan: {
  signalPx: number
  chaseGiveUp: number
}): number {
  return plan.signalPx * (1 + plan.chaseGiveUp)
}

/** True when the order sitting there is far enough from where it should be. */
export function chaseWorthMoving(
  restingPx: number | null,
  wantedPx: number
): boolean {
  if (restingPx === null) return true
  return Math.abs(wantedPx - restingPx) > wantedPx * CHASE_DRIFT
}
