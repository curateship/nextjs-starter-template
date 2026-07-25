import { z } from "zod"

import { qflBase, qflCeiling } from "@/lib/strategies/indicators"
import type { IndicatorModule, IndicatorOutput, IndicatorSignal } from "../contract"

const paramsSchema = z
  .object({
    /** How far back to search for the lowest low that forms a base. */
    basePeriods: z.number().int().min(4).max(500).default(36),
    /** Bars the new low must hold before the base is confirmed. */
    pumpPeriods: z.number().int().min(1).max(499).default(8),
    /**
     * Spacing: how many candles must pass before another level on the SAME side can
     * be marked. Arrows bunched a few candles apart at nearly one price are the
     * complaint this exists for, and spacing in candles is what "bunched" means.
     *
     * A percent gap was tried first and was the wrong shape — a market whose whole
     * range is 2% wide (ALGO 15m, July 24, 2026) can never clear a percent
     * threshold, so every value produced one or two arrows a month. Frequency is
     * governed by `basePeriods`, not by this.
     */
    formedMinBars: z.number().int().min(1).max(1000).default(20),
    /**
     * Which sides to mark. Both on by default — the indicator finds support and
     * resistance in the same pass, so hiding one is only ever a display choice.
     *  - long: BASES (support), green up arrow at each confirmed base.
     *  - short: CEILINGS (resistance), red down arrow at each confirmed ceiling.
     * Each side keeps its own spacing clock, so a long can never crowd out a short.
     */
    formedShowLong: z.boolean().default(true),
    formedShowShort: z.boolean().default(true),
    /**
     * On (default): only mark a base that sits ABOVE the base before it — the
     * textbook higher low, so a staircase down draws nothing. Off: mark every
     * confirmed base, subject only to spacing.
     *
     * This exists because the rule is otherwise invisible. On a real chart (ALGO
     * 15m, base 24 / pump 6) it hides 14 of 25 bases, and with spacing set low
     * that leaves a chart full of dashes with no arrows and nothing to explain it
     * (July 24, 2026). NOTE the comparison: the base immediately before, NOT the
     * highest base ever marked — that stricter reading was tried the same day and
     * left 1 of 11 arrows.
     */
    formedRequireHigherBase: z.boolean().default(true),
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
 * The level-formed signals — one per level, on the candle that CONFIRMS it (the
 * bar the hold completes, `pumpPeriods` after the extreme itself). No proximity
 * rule: a confirming candle usually sits well away from the level, and timing an
 * entry near it is the Price Action indicator's job, not this one's.
 *
 * Both sides are found in the same pass, each with its own switch:
 *  - long: BASES (support). Marked when the base is HIGHER than the one before —
 *    a higher low, so a market stepping down marks nothing.
 *  - short: CEILINGS (resistance). Marked when the ceiling is LOWER than the one
 *    before — a lower high, so a market stepping up marks nothing.
 * A short's take-profit level is the base below it, so leaving both sides on shows
 * the entry and the target together.
 *
 * A level is marked at least `formedMinBars` candles after the last arrow on its
 * own side. Three deliberate choices, each one a bug that reached the chart first:
 *  - Compare LEVELS, not the candles the arrows print on. A confirming candle can
 *    close higher while its level is lower, which drew arrows down a staircase.
 *  - Compare against the level immediately before it, marked or not — the textbook
 *    higher low / lower high. Comparing against the highest level ever MARKED was
 *    tried and left 1 of 11 arrows on a real chart; comparing against the last one
 *    MARKED (with a reset) let every small bounce in a fall qualify.
 *  - Count spacing in CANDLES, not percent: in a tight range no percent gap can
 *    ever be cleared, so the setting silently did nothing.
 */
function baseFormedSignals(
  candles: { t: number; c: number; l: number; h: number }[],
  params: Pick<
    BaseParams,
    | "basePeriods"
    | "pumpPeriods"
    | "formedMinBars"
    | "formedRequireHigherBase"
    | "formedShowLong"
    | "formedShowShort"
  >
): IndicatorSignal[] {
  const sides = [
    { on: params.formedShowLong, short: false },
    { on: params.formedShowShort, short: true },
  ]
  const signals: IndicatorSignal[] = []
  for (const { on, short } of sides) {
    if (!on) continue
    const { raw: levels, confirmed } = short
      ? qflCeiling(candles, params.basePeriods, params.pumpPeriods)
      : qflBase(candles, params.basePeriods, params.pumpPeriods)
    // Each side counts its own spacing, so the two never crowd each other out.
    let previous = Number.NaN
    let markedAt = -Infinity
    for (let i = 0; i < candles.length; i += 1) {
      if (!confirmed[i]) continue
      const level = levels[i]
      // Long wants a higher low; short wants a lower high. Same rule, mirrored.
      const withTrend =
        !Number.isFinite(previous) ||
        (short ? level < previous : level > previous)
      previous = level
      if (params.formedRequireHigherBase && !withTrend) continue
      if (i - markedAt < params.formedMinBars) continue
      signals.push({ time: candles[i].t, side: short ? "sell" : "buy" })
      markedAt = i
    }
  }
  // Consumers walk signals with a forward-only cursor, so keep them in order.
  return signals.sort((a, b) => a.time - b.time)
}

/**
 * Base (QFL) indicator: forming bases, and NOTHING else. It marks each confirmed
 * price base — a low that formed and then held — and fires ONE long signal per
 * base, on the candle that confirms it, painted as a green up arrow. Timing an
 * entry back near the base level belongs to the Price Action indicator; this one
 * only reports that a base is now in place.
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
    "Marks each confirmed price base and signals a long on the candle that confirms it.",
  paramsSchema,
  defaultParams: {
    basePeriods: 36,
    pumpPeriods: 8,
    formedMinBars: 20,
    formedRequireHigherBase: true,
    formedShowLong: true,
    formedShowShort: true,
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
      key: "formedRequireHigherBase",
      label: "Only levels with the trend",
      kind: "boolean",
      info: "On: going long, only mark a base above the base before it (a higher low); going short, only mark a ceiling below the ceiling before it (a lower high). Off: mark every level. This is usually why a level has a dash but no arrow.",
    },
    {
      key: "formedShowLong",
      label: "Show long arrows (bases)",
      kind: "boolean",
      info: "Green up arrow and a teal dash at each confirmed base — support.",
    },
    {
      key: "formedShowShort",
      label: "Show short arrows (ceilings)",
      kind: "boolean",
      info: "Red down arrow and a red dash at each confirmed ceiling — resistance.",
    },
    {
      key: "formedMinBars",
      label: "Minimum candles between arrows",
      info: "Arrows can never appear closer together than this many candles, so they stop bunching up. Separately and with no setting: an arrow only prints on a floor above the last one marked, and after price sets a lower floor the indicator measures from there.",
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
        "formedRequireHigherBase",
        "formedMinBars",
        "formedShowLong",
        "formedShowShort",
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
              // Each side's dashes follow its own switch, under the SAME names the
              // chart card uses so the renderer reads one spelling.
              formedShowLong: params.formedShowLong ? 1 : 0,
              formedShowShort: params.formedShowShort ? 1 : 0,
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
