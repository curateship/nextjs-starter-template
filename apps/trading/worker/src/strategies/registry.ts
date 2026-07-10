import { strategyConfigSchema } from "@/lib/strategies/strategy-config"

import { createSignalStrategy } from "../engine/signal-strategy"
import type { Strategy } from "./contract"

/**
 * Resolves a bot/backtest row to its strategy implementation. Only the new
 * model ("signal") runs: it builds the one engine from the row's
 * StrategyConfig. The retired legacy types (grid, dca, momentum, qqe, vwap,
 * copy) resolve to null — their bots are archived and their saved runs render
 * results-only.
 */
export function resolveStrategy(
  strategyType: string,
  params: unknown
): Strategy<never, unknown> | null {
  if (strategyType !== "signal") return null
  const parsed = strategyConfigSchema.safeParse(params)
  if (!parsed.success) return null
  return createSignalStrategy(parsed.data) as unknown as Strategy<never, unknown>
}
