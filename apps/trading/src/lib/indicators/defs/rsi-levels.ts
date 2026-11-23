import { z } from "zod"

import { rsi } from "@/lib/strategies/indicators"
import type { IndicatorModule, IndicatorOutput, IndicatorSignal } from "../contract"

const paramsSchema = z
  .object({
    period: z.number().int().min(2).max(100),
    buyBelow: z.number().min(1).max(50),
    sellAbove: z.number().min(50).max(99),
  })
  .refine((p) => p.buyBelow < p.sellAbove, {
    message: "Buy level must be below sell level",
  })

export type RsiLevelsParams = z.infer<typeof paramsSchema>

/**
 * RSI oversold/overbought. Fires on ENTERING the zone (crossing down through
 * the buy level / up through the sell level), so a market camping in a zone
 * signals once instead of every bar.
 */
export const rsiLevelsIndicator: IndicatorModule<RsiLevelsParams> = {
  type: "rsi_levels",
  label: "RSI Levels",
  description:
    "Buys when RSI drops into oversold, sells when it rises into overbought — one signal per visit.",
  paramsSchema,
  defaultParams: { period: 14, buyBelow: 30, sellAbove: 70 },
  paramFields: [
    {
      key: "period",
      label: "RSI period",
      info: "How many candles the momentum reading is calculated over.",
    },
    {
      key: "buyBelow",
      label: "Buy below",
      step: 1,
      info: "Buy when momentum dips under this level (oversold).",
    },
    {
      key: "sellAbove",
      label: "Sell above",
      step: 1,
      info: "Sell when momentum rises above this level (overbought).",
    },
  ],
  warmupBars: (params) => Math.max(params.period * 5, 50),

  compute: (candles, params): IndicatorOutput => {
    const closes = candles.map((candle) => candle.c)
    const series = rsi(closes, params.period)
    const signals: IndicatorSignal[] = []
    for (let i = 1; i < candles.length; i += 1) {
      const prev = series[i - 1]
      const value = series[i]
      if (Number.isNaN(prev) || Number.isNaN(value)) continue
      if (prev > params.buyBelow && value <= params.buyBelow) {
        signals.push({ time: candles[i].t, side: "buy" })
      } else if (prev < params.sellAbove && value >= params.sellAbove) {
        signals.push({ time: candles[i].t, side: "sell" })
      }
    }
    return {
      paint: {
        indicators: [
          { id: "rsi", type: "rsi", enabled: true, params: { period: params.period } },
        ],
        lines: [],
        zones: [],
        barColors: [],
      },
      signals,
    }
  },
}
