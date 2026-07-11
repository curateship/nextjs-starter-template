import { z } from "zod"

import {
  INDICATOR_IDS,
  INDICATORS,
  indicatorSelectionSchema,
  type IndicatorId,
  type IndicatorParamValue,
} from "@/lib/indicators/registry"
import {
  DEFAULT_STRATEGY_SETTINGS,
  strategySettingsSchema,
} from "@/lib/strategies/settings"

import { eraseKind, type StrategyKindModule } from "./contract"

/**
 * The signal kind: an indicator traded with the universal settings block.
 * Indicators are this kind's own plug-in layer — each one is a module in
 * src/lib/indicators/defs registered in the indicator registry, and this
 * card fans them out as dashboard identities (one typeId per indicator).
 */
export const signalStrategyConfigSchema = z.object({
  v: z.literal(2),
  /** Engine discriminator; configs saved before DCA existed omit it. */
  kind: z.literal("signal").default("signal"),
  interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]),
  indicator: indicatorSelectionSchema,
  settings: strategySettingsSchema,
})

export type SignalStrategyConfig = z.infer<typeof signalStrategyConfigSchema>

const signalKindModule: StrategyKindModule<SignalStrategyConfig> = {
  kind: "signal",
  configSchema: signalStrategyConfigSchema,
  typeIds: () => INDICATOR_IDS,
  typeOf: (config) => config.indicator.type,
  typeLabel: (typeId) => INDICATORS[typeId as IndicatorId]?.label ?? typeId,
  typeDescription: (typeId) =>
    INDICATORS[typeId as IndicatorId]?.description ?? "",
  defaultConfig: (typeId, interval) => {
    const indicator = (
      typeId in INDICATORS ? typeId : "qqe"
    ) as IndicatorId
    return {
      v: 2,
      kind: "signal",
      interval,
      indicator: {
        type: indicator,
        params: {
          ...(INDICATORS[indicator].defaultParams as Record<
            string,
            IndicatorParamValue
          >),
        },
      },
      settings: { ...DEFAULT_STRATEGY_SETTINGS },
    }
  },
  // The editor renders this kind bespoke: the indicator's own paramFields
  // plus the universal SettingsFields block.
  paramFields: null,
  summary: (config) => {
    const s = config.settings
    const parts = [
      s.direction === "both" ? "long+short" : `${s.direction} only`,
      `$${s.orderSizeUsd}/trade`,
    ]
    if (s.takeProfitPct) parts.push(`TP ${s.takeProfitPct}%`)
    if (s.stopLossPct) parts.push(`SL ${s.stopLossPct}%`)
    if (s.flipOnOppositeSignal) parts.push("flip")
    if (s.compounding) parts.push("compound")
    return parts.join(" · ")
  },
  inputRows: (config) => {
    const module = INDICATORS[config.indicator.type]
    const rows = [
      { label: "Indicator", value: module?.label ?? config.indicator.type },
    ]
    for (const field of module?.paramFields ?? []) {
      const value = config.indicator.params[field.key]
      if (value !== undefined) {
        rows.push({ label: field.label, value: String(value) })
      }
    }
    const st = config.settings
    rows.push(
      { label: "Direction", value: st.direction },
      {
        label: "Order size",
        value: st.compounding ? "compounding" : `$${st.orderSizeUsd}`,
      },
      {
        label: "Take profit",
        value: st.takeProfitPct ? `${st.takeProfitPct}%` : "off",
      },
      {
        label: "Stop loss",
        value: st.stopLossPct ? `${st.stopLossPct}%` : "off",
      },
      {
        label: "Flip on opposite",
        value: st.flipOnOppositeSignal ? "on" : "off",
      }
    )
    return rows
  },
  warmupBars: (config) => {
    const module = INDICATORS[config.indicator.type]
    return module.warmupBars(config.indicator.params as never) + 5
  },
  takeProfitPct: (config) => config.settings.takeProfitPct ?? null,
}

export const signalKind = eraseKind(signalKindModule)
