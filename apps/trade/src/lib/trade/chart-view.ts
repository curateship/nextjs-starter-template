import { z } from "zod"

/**
 * Exactly how a chart is set up, in numbers that mean the same thing on any
 * market — so the chart you leave is the chart you get back, everywhere.
 *
 * Four numbers, two for each direction:
 *
 * - `bars` — how many candles fit across the screen. The sideways zoom.
 * - `gap` — how many candles the right edge sits behind the newest one. The
 *   sideways position. Zero is looking at now; positive is back in history;
 *   negative is out in the empty space to the right of the newest candle,
 *   which is a real place to stand and a common one.
 * - `marginTop` / `marginBottom` — how much of the height sits above and below
 *   the candles, as fractions of the whole. Together they are the up-and-down
 *   squash: the candles fill whatever is left, so `0.2` and `0.1` leaves them
 *   70% of the height, and dragging the price axis to flatten the chart raises
 *   both.
 *
 * Nothing here is a price or a time, which is the point. A price window
 * carried from BTC onto a $2,000 coin would show an empty chart; a share of
 * the height means the same thing on both.
 */

/** The narrowest and widest views worth remembering. */
const MIN_BARS = 3
const MAX_BARS = 100_000
/** Past this the candles would be a line at the edge, which is nobody's intent. */
const MAX_MARGIN = 0.9

/**
 * The library's own share of the height above and below the candles. Named
 * here because two places need the same pair: a view saved before the
 * up-and-down half existed, and a chart put back to how it started.
 */
export const DEFAULT_MARGIN_TOP = 0.2
export const DEFAULT_MARGIN_BOTTOM = 0.1

export const chartViewSchema = z.object({
  bars: z.number().min(MIN_BARS).max(MAX_BARS),
  gap: z.number().min(-MAX_BARS).max(MAX_BARS),
  // Defaulted rather than required: a view saved before the up-and-down half
  // existed still gives its zoom and position back, and gets the library's own
  // margins for the rest.
  marginTop: z.number().min(0).max(MAX_MARGIN).default(DEFAULT_MARGIN_TOP),
  marginBottom: z.number().min(0).max(MAX_MARGIN).default(DEFAULT_MARGIN_BOTTOM),
})

export type ChartView = z.infer<typeof chartViewSchema>

/** A stored view, or null when it cannot be read. */
export function readChartView(value: unknown): ChartView | null {
  const parsed = chartViewSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * What the chart is showing now, as something worth saving.
 *
 * `top` and `bottom` are the prices at the very top and bottom edges of the
 * plot; `high` and `low` are the highest and lowest prices among the candles
 * on screen. The two together are what turn a price window into a share of the
 * height.
 */
export function viewOf(input: {
  range: { from: number; to: number }
  barCount: number
  top: number
  bottom: number
  high: number
  low: number
}): ChartView | null {
  const { range, barCount, top, bottom, high, low } = input
  const bars = range.to - range.from
  if (!Number.isFinite(bars) || bars < MIN_BARS || bars > MAX_BARS) return null
  const gap = barCount - 1 - range.to
  if (!Number.isFinite(gap) || Math.abs(gap) > MAX_BARS) return null

  const height = top - bottom
  if (!(height > 0) || !Number.isFinite(high) || !Number.isFinite(low)) {
    return null
  }
  return {
    bars,
    gap,
    marginTop: clampMargin((top - high) / height),
    marginBottom: clampMargin((low - bottom) / height),
  }
}

/**
 * A margin is a share of the height, so it can only describe candles that fit
 * inside the view. Dragging the price axis switches the chart off automatic
 * scaling, and the price can then run outside the window it was left at — the
 * candles overflow, and the honest answer would be a negative margin. Zero is
 * the closest thing that can be said, and it is what gets remembered: a view
 * where the candles fill the height. The sideways half is unaffected, which is
 * why this is clamped rather than refused.
 */
function clampMargin(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), MAX_MARGIN)
}

/**
 * The same sideways view, on a chart with this many candles.
 *
 * Reproduced exactly — the same zoom and the same distance behind the newest
 * candle — because the whole point is that the chart looks the way it was
 * left. The one thing guarded against is a view with no candles in it at all,
 * which a market whose history is shorter than the scroll could otherwise
 * produce: the window is slid back until it touches the data, and never
 * resized.
 */
export function frameOf(
  view: ChartView,
  barCount: number
): { from: number; to: number } | null {
  if (barCount < 2) return null
  const newest = barCount - 1
  // At least one candle inside the window at each extreme.
  const to = Math.min(Math.max(newest - view.gap, 0), newest + view.bars)
  return { from: to - view.bars, to }
}

/** Close enough to be the same view — used to skip saving what is already saved. */
export function sameView(a: ChartView | null, b: ChartView | null): boolean {
  if (a === null || b === null) return a === b
  return (
    Math.abs(a.bars - b.bars) < 0.01 &&
    Math.abs(a.gap - b.gap) < 0.01 &&
    Math.abs(a.marginTop - b.marginTop) < 0.002 &&
    Math.abs(a.marginBottom - b.marginBottom) < 0.002
  )
}
