import { z } from "zod"

import { indicatorSelectionSchema } from "@/lib/indicators/registry"
import { strategySettingsSchema } from "./settings"

/**
 * A saved strategy's full definition: which indicator it trades, on what
 * timeframe, with the universal settings block. Stored in the `strategies`
 * table and snapshotted into `bots.params` (strategy_type = "signal") at bot
 * creation. `v: 2` discriminates from legacy strategy params at a glance.
 */
export const strategyConfigSchema = z.object({
  v: z.literal(2),
  interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]),
  indicator: indicatorSelectionSchema,
  settings: strategySettingsSchema,
})

export type StrategyConfig = z.infer<typeof strategyConfigSchema>

/** Cheap shape guard for jsonb params that may be legacy or new-model. */
export function isStrategyConfig(params: unknown): params is StrategyConfig {
  return (
    typeof params === "object" &&
    params !== null &&
    (params as { v?: unknown }).v === 2 &&
    strategyConfigSchema.safeParse(params).success
  )
}
