import { automationConfigSchema } from "@/lib/strategies/strategy-config"

import { createAutomationStrategy } from "../engine/automation-strategy"
import type { Strategy } from "./contract"

/**
 * Resolves a bot/backtest row to its strategy implementation, built from the
 * row's AutomationConfig. Automations are the only engine. Invalid configs
 * resolve to null.
 */
export function resolveStrategy(params: unknown): Strategy<never, unknown> | null {
  const parsed = automationConfigSchema.safeParse(params)
  return parsed.success
    ? (createAutomationStrategy(parsed.data as never) as Strategy<
        never,
        unknown
      >)
    : null
}
