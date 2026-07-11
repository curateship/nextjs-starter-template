import { z } from "zod"

import type { IndicatorId } from "@/lib/indicators/registry"
import {
  automationStrategyConfigSchema,
  type AutomationStrategyConfig,
} from "@/lib/automations/automation"
import type { AnyStrategyKindModule } from "./kinds/contract"
import {
  dcaStrategyConfigSchema,
  type DcaStrategyConfig,
} from "./kinds/dca"
import {
  kindForType,
  STRATEGY_KIND_BY_ID,
  STRATEGY_KINDS,
} from "./kinds/registry"
import {
  signalStrategyConfigSchema,
  type SignalStrategyConfig,
} from "./kinds/signal"

export {
  automationStrategyConfigSchema,
  dcaStrategyConfigSchema,
  signalStrategyConfigSchema,
  type AutomationStrategyConfig,
  type DcaStrategyConfig,
  type SignalStrategyConfig,
}

/**
 * A saved strategy's full definition, stored in the `strategies` table and
 * snapshotted into `bots.params` / `backtests.params`. `v: 2` discriminates
 * from legacy strategy params at a glance; `kind` picks the engine.
 *
 * The runtime union is built from the strategy-kind registry, so a new kind
 * parses everywhere the moment its card is registered. This manual type
 * union is the one line a new kind adds here.
 */
export type StrategyConfig =
  | SignalStrategyConfig
  | DcaStrategyConfig
  | AutomationStrategyConfig

type StrategyConfigInput =
  | z.input<typeof signalStrategyConfigSchema>
  | z.input<typeof dcaStrategyConfigSchema>
  | z.input<typeof automationStrategyConfigSchema>

export const strategyConfigSchema = z.union(
  STRATEGY_KINDS.map((kind) => kind.configSchema)
) as unknown as z.ZodType<StrategyConfig, StrategyConfigInput>

/** Cheap shape guard for jsonb params that may be legacy or new-model. */
export function isStrategyConfig(params: unknown): params is StrategyConfig {
  return (
    typeof params === "object" &&
    params !== null &&
    (params as { v?: unknown }).v === 2 &&
    strategyConfigSchema.safeParse(params).success
  )
}

/** The registry card for a config's kind. Configs saved before kinds existed
 * carry no `kind` field at runtime, so they fall back to signal — the same
 * default the schema applies when parsing. */
export function strategyKindOf(config: StrategyConfig): AnyStrategyKindModule {
  return STRATEGY_KIND_BY_ID[config.kind] ?? STRATEGY_KIND_BY_ID.signal
}

/**
 * Parse unknown jsonb into a normalized config — the kind discriminator is
 * defaulted, so `config.kind` reads are safe afterwards. API serializers run
 * every stored config through this before it reaches the client; configs
 * saved before kinds existed have no `kind` in the database. Null = not a
 * new-model config (e.g. archived legacy params).
 */
export function normalizeStrategyConfig(params: unknown): StrategyConfig | null {
  const parsed = strategyConfigSchema.safeParse(params)
  return parsed.success ? parsed.data : null
}

/**
 * The dashboard's "strategy type": signal strategies are identified by their
 * indicator (registry id), single-engine kinds by their kind id. Drives the
 * backtest overview rows and the /backtest/$strategyType routes.
 */
export type StrategyTypeId = IndicatorId | "dca" | "automation"

export const STRATEGY_TYPE_IDS = STRATEGY_KINDS.flatMap((kind) =>
  kind.typeIds()
) as readonly StrategyTypeId[]

/** Types the normal Strategies editor may create; Automations use a canvas. */
export const STRATEGY_EDITOR_TYPE_IDS = STRATEGY_KINDS.filter(
  (kind) => kind.availableInStrategyEditor !== false
).flatMap((kind) => kind.typeIds()) as readonly StrategyTypeId[]

export const strategyTypeIdSchema = z.enum(
  STRATEGY_TYPE_IDS as [StrategyTypeId, ...StrategyTypeId[]]
)

export function strategyTypeOf(config: StrategyConfig): StrategyTypeId {
  return strategyKindOf(config).typeOf(config as never) as StrategyTypeId
}

export function strategyTypeLabel(type: StrategyTypeId): string {
  return kindForType(type)?.typeLabel(type) ?? type
}

export function strategyTypeDescription(type: StrategyTypeId): string {
  return kindForType(type)?.typeDescription(type) ?? ""
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

/** Fresh editor config for a dashboard type id. */
export function defaultStrategyConfig(
  type: StrategyTypeId,
  interval: StrategyConfig["interval"]
): StrategyConfig {
  const kind = kindForType(type) ?? STRATEGY_KIND_BY_ID.signal
  return kind.defaultConfig(type, interval) as StrategyConfig
}
