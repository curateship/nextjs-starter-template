import { z } from "zod"

import type { IndicatorId } from "@/lib/indicators/registry"
import {
  automationStrategyConfigSchema,
  type AutomationStrategyConfig,
} from "@/lib/automations/automation"
import type { AnyStrategyKindModule } from "./kinds/contract"
import {
  kindForType,
  STRATEGY_KIND_BY_ID,
  STRATEGY_KINDS,
} from "./kinds/registry"

export { automationStrategyConfigSchema, type AutomationStrategyConfig }

/**
 * A saved strategy's full definition, snapshotted into `bots.params` /
 * `backtests.params`. `v: 2` discriminates from legacy strategy params at a
 * glance; `kind` picks the engine. Automation is the only kind today — the
 * type stays a named alias so a future kind is one union member away.
 */
export type StrategyConfig = AutomationStrategyConfig

export const strategyConfigSchema: z.ZodType<
  StrategyConfig,
  z.input<typeof automationStrategyConfigSchema>
> = automationStrategyConfigSchema

/** Cheap shape guard for jsonb params that may be legacy or new-model. */
export function isStrategyConfig(params: unknown): params is StrategyConfig {
  return (
    typeof params === "object" &&
    params !== null &&
    (params as { v?: unknown }).v === 2 &&
    strategyConfigSchema.safeParse(params).success
  )
}

/** The registry card for a config's kind. */
export function strategyKindOf(config: StrategyConfig): AnyStrategyKindModule {
  return STRATEGY_KIND_BY_ID[config.kind] ?? STRATEGY_KIND_BY_ID.automation
}

/**
 * Parse unknown jsonb into a normalized config. API serializers run every
 * stored config through this before it reaches the client. Null = not a
 * new-model config (e.g. archived legacy params).
 */
export function normalizeStrategyConfig(params: unknown): StrategyConfig | null {
  const parsed = strategyConfigSchema.safeParse(params)
  return parsed.success ? parsed.data : null
}

/**
 * The dashboard's "strategy type". Only "automation" exists today; the
 * IndicatorId arm remains for typing spots that historically carried an
 * indicator id (e.g. old run rows' indicatorType strings).
 */
export type StrategyTypeId = IndicatorId | "automation"

export const STRATEGY_TYPE_IDS = STRATEGY_KINDS.flatMap((kind) =>
  kind.typeIds()
) as readonly StrategyTypeId[]

export const strategyTypeIdSchema = z.enum(
  STRATEGY_TYPE_IDS as [StrategyTypeId, ...StrategyTypeId[]]
)

export function strategyTypeOf(config: StrategyConfig): StrategyTypeId {
  return strategyKindOf(config).typeOf(config as never) as StrategyTypeId
}

export function strategyTypeLabel(type: StrategyTypeId): string {
  return kindForType(type)?.typeLabel(type) ?? type
}

/** One-line settings summary for strategy cards and list rows. */
export function strategySummary(config: StrategyConfig): string {
  return strategyKindOf(config).summary(config as never)
}

/** Read-only label/value rows for the backtest Inputs rail. */
export function strategyInputRows(
  config: StrategyConfig
): { label: string; value: string }[] {
  return strategyKindOf(config).inputRows(config as never)
}

/** The kind's hard TP bound (backtest credibility tripwire), or null. */
export function strategyTakeProfitPct(config: StrategyConfig): number | null {
  return strategyKindOf(config).takeProfitPct(config as never)
}
