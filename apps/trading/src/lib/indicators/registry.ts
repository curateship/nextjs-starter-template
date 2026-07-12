import { z } from "zod"

import type { IndicatorType } from "@/lib/trading/indicators-config"
import type { IndicatorModule } from "./contract"
import { bollingerIndicator } from "./defs/bollinger"
import { breakoutIndicator } from "./defs/breakout"
import { emaCrossIndicator } from "./defs/ema-cross"
import { macdCrossIndicator } from "./defs/macd-cross"
import { priceActionIndicator } from "./defs/price-action"
import { qqeIndicator } from "./defs/qqe"
import { rsiLevelsIndicator } from "./defs/rsi-levels"
import { vwapCrossIndicator } from "./defs/vwap-cross"

export const INDICATOR_IDS = [
  "qqe",
  "ema_cross",
  "rsi_levels",
  "macd_cross",
  "vwap_cross",
  "breakout",
  "bollinger",
  "price_action",
] as const

export type IndicatorId = (typeof INDICATOR_IDS)[number]

export const indicatorIdSchema = z.enum(INDICATOR_IDS)

/** A module with its param type erased, for registry-level dispatch. */
export type AnyIndicatorModule = IndicatorModule<never>

const erase = <P,>(module: IndicatorModule<P>): AnyIndicatorModule =>
  module as unknown as AnyIndicatorModule

/** Every indicator the strategy system offers — the chart, the live bot, and
 * the backtest all dispatch through this one table. */
export const INDICATORS: Record<IndicatorId, AnyIndicatorModule> = {
  qqe: erase(qqeIndicator),
  ema_cross: erase(emaCrossIndicator),
  rsi_levels: erase(rsiLevelsIndicator),
  macd_cross: erase(macdCrossIndicator),
  vwap_cross: erase(vwapCrossIndicator),
  breakout: erase(breakoutIndicator),
  bollinger: erase(bollingerIndicator),
  price_action: erase(priceActionIndicator),
}

/**
 * Chart-overlay indicator types that have a signal-module counterpart.
 * Pinning the chart indicator also offers its signal version on the
 * automation canvas. Base and Sessions are draw-only (no buy/sell rule),
 * so they have no entry here.
 */
export const SIGNAL_FOR_CHART_TYPE: Partial<Record<IndicatorType, IndicatorId>> = {
  ema: "ema_cross",
  vwap: "vwap_cross",
  bollinger: "bollinger",
  rsi: "rsi_levels",
  macd: "macd_cross",
  priceAction: "price_action",
}

/** Indicator params are always scalar (numbers, enums, flags) — this keeps
 * strategy configs JSON-wire-serializable end to end. */
export type IndicatorParamValue = string | number | boolean

/** A picked indicator with its params, as stored in a strategy config. */
export type IndicatorSelection = {
  type: IndicatorId
  params: Record<string, IndicatorParamValue>
}

export const indicatorSelectionSchema = z
  .object({
    type: indicatorIdSchema,
    params: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()])
    ),
  })
  .superRefine((selection, ctx) => {
    const module = INDICATORS[selection.type]
    const parsed = module.paramsSchema.safeParse(selection.params)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: ["params", ...issue.path],
          message: issue.message,
        })
      }
    }
  })

