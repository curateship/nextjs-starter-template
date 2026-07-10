import { strategyConfigSchema } from "@/lib/strategies/strategy-config"

import { createSignalStrategy } from "../engine/signal-strategy"
import type { Strategy } from "./contract"

/**
 * Resolves a bot/backtest row to its strategy implementation: the one engine,
 * built from the row's StrategyConfig. Invalid configs resolve to null.
 */
export function resolveStrategy(params: unknown): Strategy<never, unknown> | null {
  const parsed = strategyConfigSchema.safeParse(params)
  if (!parsed.success) return null
  return createSignalStrategy(parsed.data) as unknown as Strategy<never, unknown>
}
