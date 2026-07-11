import type { z } from "zod"

import type { IndicatorParamField } from "@/lib/indicators/contract"
import type { IndicatorParamValue } from "@/lib/indicators/registry"

/**
 * The strategy-kind layer — every kind of strategy (indicator signals, the
 * DCA ladder, future engines) fills out one of these cards. Screens read the
 * card instead of hard-coding per-kind branches, so adding a strategy kind is
 * two files: a card here (registered in ./registry) and an engine in
 * worker/src/engine (registered in worker/src/strategies/registry).
 *
 * Cards are isomorphic: pure data and functions, no React, safe to import
 * from the client, the server, and the worker.
 */
export type StrategyKindModule<C> = {
  /** The config discriminator ("signal", "dca", ...). */
  kind: string
  /** Zod branch for this kind's full config (one arm of the config union). */
  configSchema: z.ZodType<C>
  /**
   * Dashboard identities this kind contributes to the backtest overview and
   * the /backtest/$strategyType routes. Signal fans out into one id per
   * indicator; single-engine kinds contribute their own kind.
   */
  typeIds: () => readonly string[]
  /** Which of this kind's typeIds a given config is. */
  typeOf: (config: C) => string
  typeLabel: (typeId: string) => string
  /** One plain-English sentence for the overview row / editor. */
  typeDescription: (typeId: string) => string
  /** Fresh editor config for one of this kind's typeIds. */
  defaultConfig: (typeId: string, interval: StrategyInterval) => C
  /**
   * Editor form: scalar fields rendered generically via params/setParam.
   * null = the kind renders a bespoke section (only signal, whose form is
   * the indicator picker plus the universal settings block).
   */
  paramFields: IndicatorParamField[] | null
  params?: (config: C) => Record<string, IndicatorParamValue>
  setParam?: (config: C, key: string, value: IndicatorParamValue) => C
  /** Optional helper line under the editor fields (e.g. ladder sizing). */
  editorNote?: (config: C) => string | null
  /** One-line settings summary for strategy cards and list rows. */
  summary: (config: C) => string
  /** Read-only label/value rows for the backtest Inputs rail. */
  inputRows: (config: C) => { label: string; value: string }[]
  /** Bars of history needed before simStart. */
  warmupBars: (config: C) => number
  /**
   * The hard take-profit bound (percent) a winning trade can never beat, or
   * null. Feeds the backtest runner's credibility tripwire.
   */
  takeProfitPct: (config: C) => number | null
}

export type StrategyInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d"

/** A card with its config type erased, for registry-level dispatch. */
export type AnyStrategyKindModule = StrategyKindModule<never>

export const eraseKind = <C,>(
  module: StrategyKindModule<C>
): AnyStrategyKindModule => module as unknown as AnyStrategyKindModule
