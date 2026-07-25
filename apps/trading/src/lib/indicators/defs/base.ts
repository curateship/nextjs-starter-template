import { z } from "zod"

import { qflBase } from "@/lib/strategies/indicators"
import type { IndicatorModule, IndicatorOutput, IndicatorSignal } from "../contract"

const paramsSchema = z
  .object({
    /** How far back to search for the lowest low that forms a base. */
    basePeriods: z.number().int().min(4).max(500).default(36),
    /** Bars the new low must hold before the base is confirmed. */
    pumpPeriods: z.number().int().min(1).max(499).default(8),
    /**
     * Base-formed longs only print on a candle NEAR the base: its close must sit
     * within this percent of the base level, above or below. A base confirms
     * `pumpPeriods` bars after its low, by which point price has usually bounced
     * well clear of it, so the mark waits for the first candle back at the base
     * (one per base) and skips everything further away.
     */
    formedWithinPct: z.number().positive().max(50).default(1),
    /**
     * How long a confirmed base keeps waiting for that near-base candle. If price
     * hasn't come back within this many candles of the confirmation, the base
     * goes stale and never prints. Measured on ETH: genuine returns land 0–35
     * candles after confirmation, so 40 keeps those and drops the stale ones.
     */
    formedValidBars: z.number().int().min(1).max(1000).default(40),
    /**
     * Trend confirmation, measured between SIGNALS (not candles): only draw a
     * base-formed mark when it sits above the previous mark. Marks that would land
     * lower are still computed — the next mark is measured against them — but are
     * never drawn, so a staircase of falling bases paints nothing and only a
     * rising sequence of bases shows arrows.
     */
    formedRequireRising: z.boolean().default(true),
    /** DCA ladder setting (not an indicator signal): how far below the base a
     * close must fall to count as a crack. Read by the DCA node. */
    crackPct: z.number().positive().max(50).default(2.5),
    /** DCA ladder setting: the fall must be fast — price sat at/above the base
     * within this many candles before the crack, so slow bleeds don't count. */
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
 * The "base formed" longs — the ONLY Base signal the chart paints as arrows.
 * A base is confirmed `pumpPeriods` bars after its low, by which point price has
 * usually bounced clear of it, so the mark waits for the first candle that closes
 * within `formedWithinPct` of the base level and prints once per base.
 *
 * With `formedRequireRising` on, a signal is only DRAWN when it sits above the
 * previous signal — the trend has to be stepping up. Lower signals are still
 * computed (they are the yardstick the next one is measured against) but never
 * shown, so a staircase of falling bases paints nothing.
 */
function baseFormedSignals(
  candles: { t: number; c: number; l: number }[],
  params: Pick<
    BaseParams,
    | "basePeriods"
    | "pumpPeriods"
    | "formedWithinPct"
    | "formedValidBars"
    | "formedRequireRising"
  >
): IndicatorSignal[] {
  const { raw: bases, confirmed } = qflBase(
    candles,
    params.basePeriods,
    params.pumpPeriods
  )
  // Every base's mark, shown or not, with the price it would print at.
  const candidates: { time: number; price: number }[] = []
  let awaiting = Number.NaN
  let confirmedAt = 0
  for (let i = 0; i < candles.length; i += 1) {
    if (confirmed[i]) {
      awaiting = bases[i]
      confirmedAt = i
    }
    if (!Number.isFinite(awaiting)) continue
    // Stale: price never came back inside the window, so this base is done.
    if (i - confirmedAt > params.formedValidBars) {
      awaiting = Number.NaN
      continue
    }
    const distancePct = (Math.abs(candles[i].c - awaiting) / awaiting) * 100
    if (distancePct >= params.formedWithinPct) continue
    candidates.push({ time: candles[i].t, price: candles[i].c })
    awaiting = Number.NaN
  }

  return candidates
    .filter((candidate, index) => {
      if (!params.formedRequireRising) return true
      // The first mark has nothing to compare against, so it stands.
      const previous = candidates[index - 1]
      return !previous || candidate.price > previous.price
    })
    .map((candidate) => ({ time: candidate.time, side: "buy" as const }))
}

/**
 * Base (QFL) indicator: forming bases, and NOTHING else. It marks each confirmed
 * price base — a low that formed and then held — and fires ONE long signal per
 * base: the first candle that closes within `formedWithinPct` of the base level
 * and no later than `formedValidBars` candles after the base was confirmed,
 * painted as a green up arrow sitting at the base.
 *
 * Breaking a base is deliberately NOT here. The crack rule (price closing
 * `crackPct` under the base after a fast fall) belongs to the DCA ladder, which
 * tracks bases itself in worker/src/engine/dca-automation.ts using the helpers in
 * lib/automations/qfl.ts (`advanceQflBaseTracker`, `qflBaseRespectScore`). The
 * crack settings still ride on this indicator's params because the DCA node reads
 * its base detection from the Base node wired into it.
 *
 * Draws through the chart's own "base" overlay (each base as a short horizontal
 * dash), so an automation using Base paints exactly what the trade chart's Base
 * overlay paints. Same compute powers the chart, backtest, and live bot.
 */
export const baseIndicator: IndicatorModule<BaseParams> = {
  type: "base",
  label: "Base",
  description:
    "Marks each confirmed price base and signals a long when price is back at that base.",
  paramsSchema,
  defaultParams: {
    basePeriods: 36,
    pumpPeriods: 8,
    formedWithinPct: 1,
    formedValidBars: 40,
    formedRequireRising: true,
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
      key: "formedWithinPct",
      label: "Formed within (%)",
      step: 0.1,
      info: "How close to the base a candle must close for the formed-base long to print. Candles further away than this are skipped, so the mark lands on the base itself.",
    },
    {
      key: "formedValidBars",
      label: "Valid for (candles)",
      info: "How long a base keeps waiting for price to come back to it. If no candle closes near the base within this many candles of it being confirmed, that base goes stale and never prints.",
    },
    {
      key: "formedRequireRising",
      label: "Only rising signals",
      kind: "boolean",
      info: "Only show a base mark that sits above the previous base mark, so a staircase of lower and lower bases shows nothing. The skipped marks are still measured against, they just aren't drawn.",
    },
    {
      key: "crackPct",
      label: "Crack %",
      step: 0.1,
      info: "Used by the DCA node, not by this indicator's own signal: how far below the base a candle must close for the DCA ladder to count a break.",
    },
    {
      key: "maxCrackBars",
      label: "Maximum fall (candles)",
      info: "Used by the DCA node: the drop must be quick — price was still up at the base within this many candles, so a slow slide underneath it is ignored.",
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
      keys: [
        "basePeriods",
        "pumpPeriods",
        "formedWithinPct",
        "formedValidBars",
        "formedRequireRising",
      ],
    },
    {
      // Not this indicator's signal: the DCA node reads these off the Base node
      // wired into it to run its own crack rule.
      title: "Base break (DCA node)",
      keys: ["crackPct", "maxCrackBars"],
    },
    {
      title: "Past base quality (DCA node)",
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
    // Forming bases is ALL this indicator signals. Breaking a base is the DCA
    // ladder's rule and runs in the DCA worker engine off the settings below.
    const signals = baseFormedSignals(candles, params)

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
