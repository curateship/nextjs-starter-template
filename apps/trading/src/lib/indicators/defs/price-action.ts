import { z } from "zod"

import {
  detectPriceAction,
  type PriceActionOptions,
} from "@/lib/strategies/price-action"
import type { IndicatorModule, IndicatorOutput, IndicatorSignal } from "../contract"

const paramsSchema = z.object({
  bullHammer: z.boolean(),
  bearShootingStar: z.boolean(),
  bullEngulfing: z.boolean(),
  bearEngulfing: z.boolean(),
  bullSweep: z.boolean(),
  bearSweep: z.boolean(),
  bullBos: z.boolean(),
  bearBos: z.boolean(),
  wickBodyRatio: z.number().min(0.5).max(10),
  extremeLookback: z.number().int().min(1).max(100),
  sweepLookback: z.number().int().min(2).max(400),
  swingLookback: z.number().int().min(2).max(100),
})

export type PriceActionParams = z.infer<typeof paramsSchema>

/**
 * Candlestick/structure patterns from the chart's Price Action indicator:
 * hammer, shooting star, engulfing, liquidity sweep, break of structure.
 * Bull patterns emit buys, bear patterns emit sells — the same detector the
 * price chart paints, so the canvas trades exactly what the chart marks.
 */
export const priceActionIndicator: IndicatorModule<PriceActionParams> = {
  type: "price_action",
  label: "Price Action",
  description:
    "Buys on bullish candle patterns (hammer, engulfing, sweep, structure break) and sells on the bearish ones.",
  paramsSchema,
  defaultParams: {
    bullHammer: true,
    bearShootingStar: true,
    bullEngulfing: true,
    bearEngulfing: true,
    bullSweep: true,
    bearSweep: true,
    bullBos: true,
    bearBos: true,
    wickBodyRatio: 2,
    extremeLookback: 5,
    sweepLookback: 20,
    swingLookback: 5,
  },
  paramFields: [
    {
      key: "bullHammer",
      label: "Hammer (buy)",
      kind: "boolean",
      info: "Buy on a hammer candle — a long lower wick showing lower prices were rejected.",
    },
    {
      key: "bullEngulfing",
      label: "Bullish engulfing (buy)",
      kind: "boolean",
      info: "Buy when a green candle fully engulfs the prior red one.",
    },
    {
      key: "bullSweep",
      label: "Liquidity sweep low (buy)",
      kind: "boolean",
      info: "Buy when price dips below a recent low then snaps back — a stop-hunt reversal.",
    },
    {
      key: "bullBos",
      label: "Structure break up (buy)",
      kind: "boolean",
      info: "Buy when price breaks above the recent swing high.",
    },
    {
      key: "bearShootingStar",
      label: "Shooting star (sell)",
      kind: "boolean",
      info: "Sell on a shooting-star candle — a long upper wick rejecting higher prices.",
    },
    {
      key: "bearEngulfing",
      label: "Bearish engulfing (sell)",
      kind: "boolean",
      info: "Sell when a red candle fully engulfs the prior green one.",
    },
    {
      key: "bearSweep",
      label: "Liquidity sweep high (sell)",
      kind: "boolean",
      info: "Sell when price spikes above a recent high then snaps back.",
    },
    {
      key: "bearBos",
      label: "Structure break down (sell)",
      kind: "boolean",
      info: "Sell when price breaks below the recent swing low.",
    },
    {
      key: "wickBodyRatio",
      label: "Wick/body ratio",
      step: 0.5,
      info: "How long a wick must be versus the candle body to count as a rejection.",
    },
    {
      key: "extremeLookback",
      label: "Extreme lookback",
      info: "How many candles back to find the high or low a wick pattern rejects.",
    },
    {
      key: "sweepLookback",
      label: "Sweep lookback",
      info: "How many candles back to find the level a liquidity sweep must grab.",
    },
    {
      key: "swingLookback",
      label: "Swing lookback",
      info: "How many candles back to define the swing highs and lows for structure breaks.",
    },
  ],
  warmupBars: (params) =>
    Math.max(
      params.sweepLookback,
      params.extremeLookback + 4,
      params.swingLookback * 2 + 1,
      50
    ),

  compute: (candles, params): IndicatorOutput => {
    const options: PriceActionOptions = {
      ...params,
      // Never truncate: prefix computes must match the full series.
      maxSignals: Number.MAX_SAFE_INTEGER,
    }
    // The detector can emit out of bar order (hammer confirms 3 bars later).
    const detected = [...detectPriceAction(candles, options)].sort(
      (a, b) => a.index - b.index
    )
    const signals: IndicatorSignal[] = []
    const seen = new Set<string>()
    for (const hit of detected) {
      const side = hit.side === "bull" ? "buy" : "sell"
      const key = `${hit.index}:${side}`
      if (seen.has(key)) continue
      seen.add(key)
      signals.push({ time: candles[hit.index].t, side })
    }
    return {
      paint: {
        indicators: [
          {
            id: "price-action",
            type: "priceAction",
            enabled: true,
            params: {
              bullHammer: params.bullHammer ? 1 : 0,
              bearShootingStar: params.bearShootingStar ? 1 : 0,
              bullEngulfing: params.bullEngulfing ? 1 : 0,
              bearEngulfing: params.bearEngulfing ? 1 : 0,
              bullSweep: params.bullSweep ? 1 : 0,
              bearSweep: params.bearSweep ? 1 : 0,
              bullBos: params.bullBos ? 1 : 0,
              bearBos: params.bearBos ? 1 : 0,
              wickBodyRatio: params.wickBodyRatio,
              extremeLookback: params.extremeLookback,
              sweepLookback: params.sweepLookback,
              swingLookback: params.swingLookback,
            },
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
