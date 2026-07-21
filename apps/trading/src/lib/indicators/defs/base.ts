import { z } from "zod"

import { qflBase } from "@/lib/strategies/indicators"
import type { IndicatorModule, IndicatorOutput, IndicatorSignal } from "../contract"

const paramsSchema = z
  .object({
    /** How far back to search for the lowest low that forms a shelf. */
    basePeriods: z.number().int().min(4).max(500).default(36),
    /** Bars the new low must hold before the shelf is confirmed. */
    pumpPeriods: z.number().int().min(1).max(499).default(8),
    /** How far below the shelf a close must fall to count as a crack. */
    crackPct: z.number().positive().max(50).default(2.5),
  })
  .superRefine((params, ctx) => {
    if (params.pumpPeriods >= params.basePeriods) {
      ctx.addIssue({
        code: "custom",
        path: ["pumpPeriods"],
        message: "Base confirmation must be shorter than the base search.",
      })
    }
  })

export type BaseParams = z.infer<typeof paramsSchema>

/**
 * Base (QFL shelf) indicator: marks each confirmed price shelf — a low that
 * formed and then held — and fires a buy signal the moment price cracks a set
 * percent below the most recent shelf. Draws through the chart's own "base"
 * overlay (each shelf as a short horizontal dash), so an automation using Base
 * paints exactly what the trade chart's Base overlay paints. The crack rule is
 * the same one the QFL entry uses. Same compute powers the chart, backtest,
 * and live bot.
 */
export const baseIndicator: IndicatorModule<BaseParams> = {
  type: "base",
  label: "Base",
  description:
    "Marks each confirmed price shelf and buys when price cracks a set percent below the most recent shelf.",
  paramsSchema,
  defaultParams: { basePeriods: 36, pumpPeriods: 8, crackPct: 2.5 },
  paramFields: [
    { key: "basePeriods", label: "Base periods" },
    { key: "pumpPeriods", label: "Confirmation bars" },
    { key: "crackPct", label: "Crack %", step: 0.1 },
  ],
  warmupBars: (params) => params.basePeriods + params.pumpPeriods + 2,

  compute: (candles, params): IndicatorOutput => {
    const bases = qflBase(candles, params.basePeriods, params.pumpPeriods).raw

    // A crack: the previous close sat at or above its shelf's threshold and
    // this close fell below the current shelf's threshold. Identical to the
    // QFL entry trigger, so Base and a QFL-style entry fire on the same bar.
    const signals: IndicatorSignal[] = []
    for (let i = 1; i < candles.length; i += 1) {
      const base = bases[i]
      const previousBase = bases[i - 1]
      if (!Number.isFinite(base) || !Number.isFinite(previousBase)) continue
      const threshold = base * (1 - params.crackPct / 100)
      const previousThreshold = previousBase * (1 - params.crackPct / 100)
      if (candles[i - 1].c >= previousThreshold && candles[i].c < threshold) {
        signals.push({ time: candles[i].t, side: "buy" })
      }
    }

    // Paint through the chart's own Base overlay (NOT a line series): the chart
    // draws each shelf as its own short horizontal dash. A connected line would
    // ramp between shelves.
    return {
      paint: {
        indicators: [
          {
            id: "base",
            type: "base",
            enabled: true,
            params: {
              basePeriods: params.basePeriods,
              pumpPeriods: params.pumpPeriods,
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
