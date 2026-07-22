import { z } from "zod"

import { qflBase } from "@/lib/strategies/indicators"
import type { IndicatorModule, IndicatorOutput, IndicatorSignal } from "../contract"

const paramsSchema = z
  .object({
    /** How far back to search for the lowest low that forms a base. */
    basePeriods: z.number().int().min(4).max(500).default(36),
    /** Bars the new low must hold before the base is confirmed. */
    pumpPeriods: z.number().int().min(1).max(499).default(8),
    /** How far below the base a close must fall to count as a crack. */
    crackPct: z.number().positive().max(50).default(2.5),
    /** The fall must be fast: price sat at/above the base within this many
     * candles before the crack, so only sharp drops (not slow bleeds) count. */
    maxCrackBars: z.number().int().min(1).max(500).default(4),
    /**
     * Past base quality: only trust markets whose past cracks tended to
     * recover. Enforced by a DCA ladder fed from this node (like QFL), which
     * scores the last `respectLookbackMonths` of history and skips a crack
     * unless at least `minRespectPct` of past cracks recovered.
     */
    respectFilterEnabled: z.boolean().default(false),
    respectLookbackMonths: z.number().int().min(1).max(60).default(6),
    minRespectPct: z.number().min(0).max(100).default(80),
    /** How far above the base price counts as a recovery (negative = below). */
    recoveryTargetPct: z.number().min(-50).max(50).default(-2),
  })
  .superRefine((params, ctx) => {
    if (params.pumpPeriods >= params.basePeriods) {
      ctx.addIssue({
        code: "custom",
        path: ["pumpPeriods"],
        message: "Base confirmation must be shorter than the base search.",
      })
    }
    if (params.recoveryTargetPct <= -params.crackPct) {
      ctx.addIssue({
        code: "custom",
        path: ["recoveryTargetPct"],
        message: "Recovery must stay above the crack level.",
      })
    }
  })

export type BaseParams = z.infer<typeof paramsSchema>

/**
 * Base (QFL) indicator: marks each confirmed price base — a low that
 * formed and then held — and fires a buy signal the moment price cracks a set
 * percent below the most recent base. Draws through the chart's own "base"
 * overlay (each base as a short horizontal dash), so an automation using Base
 * paints exactly what the trade chart's Base overlay paints. The crack rule is
 * the same one the QFL entry uses. Same compute powers the chart, backtest,
 * and live bot.
 */
export const baseIndicator: IndicatorModule<BaseParams> = {
  type: "base",
  label: "Base",
  description:
    "Marks each confirmed price base and buys when price cracks a set percent below the most recent base.",
  paramsSchema,
  defaultParams: {
    basePeriods: 36,
    pumpPeriods: 8,
    crackPct: 2.5,
    maxCrackBars: 4,
    respectFilterEnabled: false,
    respectLookbackMonths: 6,
    minRespectPct: 80,
    recoveryTargetPct: -2,
  },
  paramFields: [
    {
      key: "basePeriods",
      label: "Base periods",
      info: "How many candles back to search for the lowest low that forms a base.",
    },
    {
      key: "pumpPeriods",
      label: "Confirmation bars",
      info: "How many candles the new low must hold before the base counts as confirmed.",
    },
    {
      key: "crackPct",
      label: "Crack %",
      step: 0.1,
      info: "How far below the base a candle must close to count as a crack.",
    },
    {
      key: "maxCrackBars",
      label: "Maximum fall (candles)",
      info: "The drop must be quick: price was still up at the base within this many candles before the crack, so a slow slide underneath it is ignored.",
    },
    {
      key: "respectFilterEnabled",
      label: "Filter by past base quality",
      kind: "boolean",
      info: "Only trade markets whose past cracks tended to bounce back.",
    },
    {
      key: "respectLookbackMonths",
      label: "History (months)",
      info: "How many months of history to judge the market's past base quality over.",
    },
    {
      key: "minRespectPct",
      label: "Minimum respected (%)",
      info: "The smallest share of past cracks that must have recovered before a trade is allowed.",
    },
    {
      key: "recoveryTargetPct",
      label: "Recovery vs base (%)",
      step: 0.1,
      info: "How far above the base price counts as a recovery (negative means below the base).",
    },
  ],
  paramGroups: [
    {
      title: "Base",
      keys: ["basePeriods", "pumpPeriods", "crackPct", "maxCrackBars"],
    },
    {
      title: "Past base quality",
      keys: [
        "respectFilterEnabled",
        "respectLookbackMonths",
        "minRespectPct",
        "recoveryTargetPct",
      ],
    },
  ],
  warmupBars: (params) => params.basePeriods + params.pumpPeriods + 2,

  compute: (candles, params): IndicatorOutput => {
    const bases = qflBase(candles, params.basePeriods, params.pumpPeriods).raw

    // A crack: the previous close sat at or above its base's threshold and
    // this close fell below the current base's threshold. Identical to the
    // QFL entry trigger, so Base and a QFL-style entry fire on the same bar.
    const signals: IndicatorSignal[] = []
    for (let i = 1; i < candles.length; i += 1) {
      const base = bases[i]
      const previousBase = bases[i - 1]
      if (!Number.isFinite(base) || !Number.isFinite(previousBase)) continue
      const threshold = base * (1 - params.crackPct / 100)
      const previousThreshold = previousBase * (1 - params.crackPct / 100)
      if (candles[i - 1].c >= previousThreshold && candles[i].c < threshold) {
        // Fast-fall gate: price must have been at/above the base within the
        // last maxCrackBars candles, so slow bleeds under the base don't fire.
        const fastStart = Math.max(0, i - params.maxCrackBars)
        const fellFast = candles
          .slice(fastStart, i)
          .some((candle) => candle.c >= base)
        if (fellFast) signals.push({ time: candles[i].t, side: "buy" })
      }
    }

    // Paint through the chart's own Base overlay (NOT a line series): the chart
    // draws each base as its own short horizontal dash. A connected line would
    // ramp between bases.
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
