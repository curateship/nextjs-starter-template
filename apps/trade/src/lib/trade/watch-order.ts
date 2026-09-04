import { z } from "zod"

import { smartOrderPauseFields } from "@/lib/trade/smart-order-pause"

/**
 * A price being watched, and the trade taken when it is reached.
 *
 * **Nothing rests on the exchange until the level is touched.** The order used
 * to go out as a limit and sit on the book; now the engine holds the level and
 * only asks for a price once the market has actually come to it. The money is
 * not committed in the meantime, the exchange's cap on open orders is not spent
 * on a maybe, and the level is not sitting there for anybody else to see.
 *
 * **What it costs.** A resting limit fills whether or not this app is alive; a
 * watched level fills only while the engine is running. That is the trade, and
 * it is the same one every ladder rung already makes.
 *
 * When the level is reached it does NOT take the market. It rests a
 * post-only order just off the touch and follows the price with it, exactly
 * the way a signal trade does — see `signal-order.ts`, whose chase this shares.
 */

const WATCH_PHASES = [
  /** Nothing sent. Waiting for price to reach the level. */
  "waiting",
  /** The level was touched; a resting order is chasing the price. */
  "taking",
  /** Called off — the next pass takes back anything resting. */
  "stopping",
] as const

export const WATCH_TRIGGER_DIRECTIONS = ["up", "down"] as const
export type WatchTriggerDirection = (typeof WATCH_TRIGGER_DIRECTIONS)[number]

// `.loose()`: see the note on gridPlanSchema in grid.ts. Unknown fields survive a save.
const watchPlanSchema = z.object({
  ...smartOrderPauseFields,
  /** The price that starts it: the level that was clicked. */
  triggerPx: z.number().positive(),
  /**
   * Which way price must travel into the level before this watch starts.
   *
   * Missing means the row predates directional watches. Those rows keep the
   * old side-based rule below, so an upgrade never changes an order already
   * waiting in somebody's account.
   */
  triggerDirection: z.enum(WATCH_TRIGGER_DIRECTIONS).optional(),
  side: z.enum(["buy", "sell"]),
  /** How much of the coin to trade, frozen when the watch was set. */
  sz: z.number().positive(),
  leverage: z.number().positive(),
  maxLeverage: z.number().positive(),
  /** The market's size step, frozen the same way every other plan freezes it. */
  sizeDecimals: z.number().nullable(),
  /** The least coin size accepted when this watch was placed. */
  minOrderSize: z.number().positive().nullable().default(null),
  /** The exchange's stated dollar floor when this watch was placed. */
  minOrderValueUsd: z.number().positive().nullable().default(null),
  /** The market's smallest price step, frozen with the rest. Null: no tick stated. */
  priceTick: z.number().nullable().default(null),
  /** Handed to the position this opens, once it opens one. */
  tpPx: z.number().positive().nullable(),
  slPx: z.number().positive().nullable(),
  /** Only shrink what is held — never open the other way round. */
  reduceOnly: z.boolean().default(false),
  /**
   * Never take the market: rest just off it and follow, however far price goes.
   *
   * **This is what a part close is made of.** New Long and Short watches also
   * avoid the market, through `triggerDirection`. `maker` is the stronger
   * close rule: the plan starts in its chase, sizes itself from what remains
   * held and never pays the spread. It also keeps a close out of the legacy
   * market-take path used only by older stored watches.
   *
   * It pairs with `chaseGiveUp` at zero, which means it never gives up. That
   * is deliberate and it is the app's existing rule: being half out of a
   * position is worse than any price the rest would have got.
   *
   * Defaults false, so every watch written before this existed behaves exactly
   * as it did.
   */
  maker: z.boolean().default(false),
  /**
   * How much of the coin the wallet held when a close was asked for.
   *
   * **This is what stops a part close selling more than it was asked to.** The
   * chase cancels and re-places its order every time the price drifts, and a
   * fill that landed in between would otherwise be forgotten: the next order
   * would go out at the full size again, and four coins asked for could leave
   * as six. Rather than keeping a count of what has been sold — a second
   * number that can disagree with the position it describes — the position
   * itself is the count. What is left to sell is the size asked for, less how
   * far the holding has already come down from here.
   *
   * The one way it can be wrong is something ELSE reducing the position: a
   * stop firing, or a ladder exit on the same coin. The close then thinks its
   * order filled and stops early, which sells less than asked and never more.
   *
   * Meaningless without `maker`, and zero on every plan that is not a close.
   */
  heldAtStart: z.number().default(0),
  /**
   * How far past the level it will follow the price before giving up, as a
   * share of the level. Zero waits at the level for as long as it takes.
   */
  chaseGiveUp: z.number().min(0).default(0),
  phase: z.enum(WATCH_PHASES),
  /**
   * An order reached the exchange and its fate has not been proven since.
   *
   * **This is what makes a watch spend its money at most once.** The engine
   * used to treat "my order is not in the open-orders read" as proof it was
   * gone and place a fresh one at full size — but an order can be missing
   * from that read while it rests (the exchange's list lags a moment), or
   * while it has already filled and the position has not shown yet. Either
   * way, placing again is how one $50 watch bought $150 of coin on
   * 20 Aug 2026. While this is true and no order is in sight, the watch
   * WAITS — for the position, for a fill record, or for a person — and
   * places nothing. It goes false only when a cancel provably succeeded,
   * which is the one moment "nothing of mine stands" is a fact rather than
   * a guess.
   */
  sent: z.boolean().default(false),
  /** The order resting right now, and where it is resting. */
  orderId: z.string().nullable().default(null),
  orderPx: z.number().positive().nullable().default(null),
  /**
   * When the order first went missing from the exchange's open-orders read,
   * or 0 while it is listed. Read by `judgeOrder`, which will not call an
   * order gone on one absent read — see `src/lib/trade/order-presence.ts`.
   */
  missingSince: z.number().default(0),
  /**
   * How much of this coin the wallet held the moment the order was sent.
   *
   * The only reliable way to notice a fill without the exchange listing it:
   * the amount held CHANGED. "A position exists" cannot do that job, because
   * a watch that adds to a coin already held would see one from the first
   * pass and treat every absent read as a fill.
   */
  heldWhenPlaced: z.number().default(0),
  chasedAt: z.number().default(0),
  chases: z.number().int().min(0).default(0),
  startedAt: z.number().default(0),
})

export type WatchPlan = z.infer<typeof watchPlanSchema>

/** Reads a stored plan back, or null when it cannot be read. */
/** Every top-level field this build knows a saved watch to have. */
export const WATCH_PLAN_FIELDS: ReadonlySet<string> = new Set(
  Object.keys(watchPlanSchema.shape)
)

// Reads keep fields this build does not know. See `gridPlanReader` in grid.ts.
const watchPlanReader = watchPlanSchema.loose()

export function readWatchPlan(value: unknown): WatchPlan | null {
  const parsed = watchPlanReader.safeParse(value)
  return parsed.success ? (parsed.data as WatchPlan) : null
}

/**
 * Whether the market has reached the level.
 *
 * New watches remember whether the clicked level started above or below the
 * market. Old stored watches have no direction and keep the former rule: a
 * buy is reached at or below its level, and a sell at or above it.
 */
export function watchReached(
  // Only the side and the level decide it, so the screens can ask this of a
  // row that is not a whole plan — the Watched tab holds its levels as orders.
  // One rule, so a list and the engine can never disagree about "reached".
  plan: Pick<WatchPlan, "side" | "triggerPx" | "triggerDirection">,
  mark: number
): boolean {
  if (plan.triggerDirection === "up") return mark >= plan.triggerPx
  if (plan.triggerDirection === "down") return mark <= plan.triggerPx
  return plan.side === "buy" ? mark <= plan.triggerPx : mark >= plan.triggerPx
}

/** The direction from today's price to a newly clicked watched level. */
export function watchTriggerDirection(
  triggerPx: number,
  mark: number
): WatchTriggerDirection {
  return triggerPx >= mark ? "up" : "down"
}

/**
 * How far past the level the chase may follow before giving up, or null when
 * it never gives up.
 *
 * **Null is the default and it matters.** This stands in for an order that
 * would have rested on the exchange until it filled, and an order that quietly
 * called itself off the first time price ticked back through the level would
 * be a worse thing wearing the same name. A give-up is something to ask for.
 */
export function watchCeilingPx(plan: WatchPlan): number | null {
  if (plan.chaseGiveUp <= 0) return null
  const room = plan.triggerPx * plan.chaseGiveUp
  return plan.side === "buy" ? plan.triggerPx + room : plan.triggerPx - room
}
