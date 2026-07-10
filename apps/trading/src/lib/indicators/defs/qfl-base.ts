import { z } from "zod"

import { qflBase } from "@/lib/strategies/indicators"
import type { IndicatorModule, IndicatorOutput, IndicatorSignal } from "../contract"

const paramsSchema = z.object({
  basePeriods: z.number().int().min(4).max(400),
  pumpPeriods: z.number().int().min(1).max(100),
  /** How far below the base a close must crack to fire a buy, in percent. */
  crackPct: z.number().min(0).max(50),
})

export type QflBaseParams = z.infer<typeof paramsSchema>

/**
 * QFL (Quickfingers Luc) base cracks: a "base" is a confirmed swing-low
 * support level. Buy when a close cracks `crackPct` below the current base
 * (panic dip into support), sell when a close reclaims the base from below.
 */
export const qflBaseIndicator: IndicatorModule<QflBaseParams> = {
  type: "qfl_base",
  label: "QFL Base",
  description:
    "Buys panic dips below a confirmed support level, sells when price climbs back above it.",
  paramsSchema,
  defaultParams: { basePeriods: 36, pumpPeriods: 8, crackPct: 2 },
  paramFields: [
    { key: "basePeriods", label: "Base periods" },
    { key: "pumpPeriods", label: "Pump periods" },
    { key: "crackPct", label: "Crack %", step: 0.5 },
  ],
  warmupBars: (params) => (params.basePeriods + params.pumpPeriods) * 3,

  compute: (candles, params): IndicatorOutput => {
    const { line } = qflBase(candles, params.basePeriods, params.pumpPeriods)
    const signals: IndicatorSignal[] = []
    for (let i = 1; i < candles.length; i += 1) {
      const base = line[i]
      const prevBase = line[i - 1]
      if (Number.isNaN(base) || Number.isNaN(prevBase)) continue
      const crack = base * (1 - params.crackPct / 100)
      const prevCrack = prevBase * (1 - params.crackPct / 100)
      const close = candles[i].c
      const prevClose = candles[i - 1].c
      if (prevClose >= prevCrack && close < crack) {
        signals.push({ time: candles[i].t, side: "buy" })
      } else if (prevClose <= prevBase && close > base) {
        signals.push({ time: candles[i].t, side: "sell" })
      }
    }
    return {
      paint: {
        indicators: [
          {
            id: "base",
            type: "base",
            enabled: true,
            params: { basePeriods: params.basePeriods, pumpPeriods: params.pumpPeriods },
          },
        ],
        lines: [],
        zones: [],
        barColors: [],
      },
      signals,
    }
  },
}
