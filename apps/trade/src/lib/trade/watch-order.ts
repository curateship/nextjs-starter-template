import { z } from "zod"

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

export const WATCH_PHASES = [
  /** Nothing sent. Waiting for price to reach the level. */
  "waiting",
  /** The level was touched; a resting order is chasing the price. */
  "taking",
  /** Called off — the next pass takes back anything resting. */
  "stopping",
] as const

export const watchPlanSchema = z.object({
  /** The price that starts it: the level that was clicked. */
  triggerPx: z.number().positive(),
  side: z.enum(["buy", "sell"]),
  /** How much of the coin to trade, frozen when the watch was set. */
  sz: z.number().positive(),
  leverage: z.number().positive(),
  maxLeverage: z.number().positive(),
  /** The market's size step, frozen the same way every other plan freezes it. */
  sizeDecimals: z.number().nullable(),
  /** The market's smallest price step, frozen with the rest. Null: no tick stated. */
  priceTick: z.number().nullable().default(null),
  /** Handed to the position this opens, once it opens one. */
  tpPx: z.number().positive().nullable(),
  slPx: z.number().positive().nullable(),
  /** Only shrink what is held — never open the other way round. */
  reduceOnly: z.boolean().default(false),
  /**
   * How far past the level it will follow the price before giving up, as a
   * share of the level. Zero waits at the level for as long as it takes.
   */
  chaseGiveUp: z.number().min(0).default(0),
  phase: z.enum(WATCH_PHASES),
  /** The order resting right now, and where it is resting. */
  orderId: z.string().nullable().default(null),
  orderPx: z.number().positive().nullable().default(null),
  chasedAt: z.number().default(0),
  chases: z.number().int().min(0).default(0),
  startedAt: z.number().default(0),
})

export type WatchPlan = z.infer<typeof watchPlanSchema>

/** Reads a stored plan back, or null when it cannot be read. */
export function readWatchPlan(value: unknown): WatchPlan | null {
  const parsed = watchPlanSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Whether the market has reached the level.
 *
 * A buy waits for the price to come DOWN to it and a sell waits for it to come
 * up, which is what "waiting at a price" has always meant on a chart. A level
 * already through the market when it is set is reached immediately — the
 * window says so before anything is placed.
 */
export function watchReached(plan: WatchPlan, mark: number): boolean {
  return plan.side === "buy" ? mark <= plan.triggerPx : mark >= plan.triggerPx
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
