import { z } from "zod"

/**
 * THE universal strategy settings — identical for every strategy in the new
 * model. A strategy is an indicator choice plus this one block; there are no
 * other per-strategy knobs.
 */
export const strategySettingsSchema = z.object({
  /** Which signal directions may open positions. */
  direction: z.enum(["long", "short", "both"]),
  /** Notional per entry in USD (compounding overrides with current equity). */
  orderSizeUsd: z.number().positive(),
  /** Bet the full current balance each trade so P&L carries forward. */
  compounding: z.boolean(),
  /** Optional hard take-profit, percent from entry. */
  takeProfitPct: z.number().positive().max(1000).optional(),
  /** Optional hard stop-loss, percent from entry. */
  stopLossPct: z.number().positive().max(100).optional(),
  /** An opposite signal while positioned closes (and re-enters if allowed). */
  flipOnOppositeSignal: z.boolean(),
})

export type StrategySettings = z.infer<typeof strategySettingsSchema>

export const DEFAULT_STRATEGY_SETTINGS: StrategySettings = {
  direction: "both",
  orderSizeUsd: 250,
  compounding: false,
  flipOnOppositeSignal: true,
}
