import {
  strategyConfigSchema,
  type StrategyConfig,
} from "@/lib/strategies/strategy-config"

import { createDcaStrategy } from "../engine/dca-strategy"
import { createAutomationStrategy } from "../engine/automation-strategy"
import { createSignalStrategy } from "../engine/signal-strategy"
import type { Strategy } from "./contract"

/**
 * Engine per strategy kind. TO ADD A KIND: build its engine in ../engine and
 * add one line here (its card registers in src/lib/strategies/kinds).
 */
const ENGINES: Record<string, (config: never) => Strategy<never, unknown>> = {
  automation: createAutomationStrategy as never,
  signal: createSignalStrategy as never,
  dca: createDcaStrategy as never,
}

/**
 * Resolves a bot/backtest row to its strategy implementation: the engine the
 * config's `kind` names, built from the row's StrategyConfig. Invalid configs
 * resolve to null.
 */
export function resolveStrategy(params: unknown): Strategy<never, unknown> | null {
  const parsed = strategyConfigSchema.safeParse(params)
  if (!parsed.success) return null
  const engine = ENGINES[(parsed.data as StrategyConfig).kind]
  return engine ? engine(parsed.data as never) : null
}
