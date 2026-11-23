import { z } from "zod"

import { computeFairValueGaps } from "@/lib/strategies/fair-value-gap"
import type { IndicatorModule, IndicatorOutput, IndicatorSignal } from "../contract"

const paramsSchema = z.object({
  /** Smallest imbalance to keep, as a percent of price. The anti-chop dial. */
  minGapSize: z.number().min(0).max(50).default(1),
  /** Keep drawing a gap (dimmed) after it fills, or drop it. */
  showFilled: z.boolean().default(true),
})

export type FairValueGapParams = z.infer<typeof paramsSchema>

// Translucent so candles stay legible; a filled gap fades to a faint tint.
const FILL = {
  bull: { open: "rgba(8, 153, 129, 0.18)", done: "rgba(8, 153, 129, 0.06)" },
  bear: { open: "rgba(242, 54, 69, 0.18)", done: "rgba(242, 54, 69, 0.06)" },
} as const

// A trending market leaves a long tail of never-filled gaps, and each open box
// stretches to the current bar — unbounded, they bury the chart. Draw only the
// most recent ones (the levels price is actually near).
const MAX_GAP_BOXES = 30

/**
 * Fair Value Gap (imbalance) indicator: shades each significant gap a fast
 * move leaves behind and emits a signal in the impulse's direction (bullish
 * gap → buy, bearish → sell). Used as an automation filter this latches the
 * direction of the last big move — the "is a major move underway" check for a
 * trendline break or QQE flip. Same compute powers the chart, backtest, and
 * live bot.
 */
export const fairValueGapIndicator: IndicatorModule<FairValueGapParams> = {
  type: "fair_value_gap",
  label: "Fair Value Gap",
  description:
    "Shades the imbalance a fast move leaves behind and buys/sells in its direction; a size filter ignores tiny chop gaps.",
  paramsSchema,
  defaultParams: { minGapSize: 1, showFilled: true },
  paramFields: [
    {
      key: "minGapSize",
      label: "Min gap size %",
      step: 0.1,
      info: "The smallest imbalance to keep, as a percent of price — filters out tiny chop gaps.",
    },
    {
      key: "showFilled",
      label: "Show filled gaps",
      kind: "boolean",
      info: "Keep drawing a gap (dimmed) after price fills it, instead of removing it.",
    },
  ],
  warmupBars: () => 5,

  compute: (candles, params): IndicatorOutput => {
    const { gaps, buy, sell } = computeFairValueGaps(candles, params.minGapSize)

    const signals: IndicatorSignal[] = []
    for (let i = 0; i < candles.length; i += 1) {
      if (buy[i]) signals.push({ time: candles[i].t, side: "buy" })
      else if (sell[i]) signals.push({ time: candles[i].t, side: "sell" })
    }

    // Each gap is a box from its origin candle to where it fills (or the last
    // candle while still open). Filled boxes fade back or drop out entirely.
    // Keep only the most recent boxes so a trend's tail of open gaps can't
    // bury the chart (gaps are in ascending index order, so slice the tail).
    const last = candles.length - 1
    const boxes = gaps.flatMap((gap) => {
      const filled = gap.fillIndex !== null
      if (filled && !params.showFilled) return []
      const endIndex = gap.fillIndex ?? last
      const fillColor = FILL[gap.side][filled ? "done" : "open"]
      return [
        {
          id: `fvg-${gap.side}-${gap.index}`,
          fromMs: candles[gap.index - 1].t,
          toMs: candles[endIndex].t,
          top: gap.top,
          bottom: gap.bottom,
          fillColor,
        },
      ]
    })
    const zones = boxes.slice(-MAX_GAP_BOXES)

    return { paint: { indicators: [], lines: [], zones, barColors: [] }, signals }
  },
}
