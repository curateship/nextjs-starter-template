import { z } from "zod"

import { automationConfigSchema, type AutomationConfig } from "@/lib/automations/automation"
import type { IndicatorId } from "@/lib/indicators/registry"

export { automationConfigSchema, type AutomationConfig }
export {
  automationSummary,
  automationInputRows,
  automationTakeProfitPct,
  automationWarmupBars,
} from "./kinds/automation"

/**
 * The saved config a bot or backtest runs, snapshotted into `bots.params` /
 * `backtests.params`. `v: 2` marks it as a new-model config; `kind` is always
 * "automation" today — automations are the only engine.
 */

/** Cheap shape guard for jsonb params that may be legacy or new-model. */
export function isAutomationConfig(params: unknown): params is AutomationConfig {
  return (
    typeof params === "object" &&
    params !== null &&
    (params as { v?: unknown }).v === 2 &&
    automationConfigSchema.safeParse(params).success
  )
}

/**
 * Parse unknown jsonb into a normalized config. API serializers run every
 * stored config through this before it reaches the client. Null = not a
 * new-model config (e.g. archived legacy params).
 */
export function normalizeAutomationConfig(params: unknown): AutomationConfig | null {
  const parsed = automationConfigSchema.safeParse(params)
  return parsed.success ? parsed.data : null
}

/**
 * The dashboard's "type" id. Only "automation" exists today; the IndicatorId
 * arm remains for typing spots that historically carried an indicator id
 * (e.g. old run rows' `indicatorType` strings).
 */
export type AutomationTypeId = IndicatorId | "automation"

export const AUTOMATION_TYPE_IDS = ["automation"] as const

export const automationTypeIdSchema = z.enum(AUTOMATION_TYPE_IDS)

export function automationTypeOf(_config: AutomationConfig): AutomationTypeId {
  return "automation"
}

export function automationTypeLabel(type: AutomationTypeId): string {
  return type === "automation" ? "Automation" : type
}
