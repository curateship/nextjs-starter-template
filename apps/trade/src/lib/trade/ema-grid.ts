import type { CandleBar } from "@/lib/protocols/contracts"
import type { TradeGridSettings } from "@/lib/recipes/trade-grid"
import {
  defaultGridParams,
  gridRangeFromClick,
  type GridDirection,
  type GridParams,
} from "@/lib/trade/grid"
import { ema } from "@/lib/trade/indicators/ema"

export type EmaGridStance = "long" | "short" | "none"

/** One protocol candle read. A shorter history is not enough to trust EMA 200. */
export const EMA_GRID_HISTORY_BARS = 600

/**
 * Which side of the EMA the latest clean run of candles occupies.
 *
 * The wick counts. A long needs every low above its candle's EMA, and a short
 * needs every high below it. Equality is a touch, so it returns no stance.
 */
export function emaGridStance(
  closedCandles: readonly CandleBar[],
  input: { emaPeriod: number; cleanBars: number }
): EmaGridStance {
  return emaGridStances(closedCandles, input).at(-1) ?? "none"
}

/**
 * The EMA Grid answer after every candle, worked out in one forward pass.
 *
 * A backtest asks this for years of candles. Recomputing EMA 200 from the
 * beginning on every bar turns that into a quadratic walk; this keeps the
 * live one-candle answer and the historical series on the same arithmetic.
 */
export function emaGridStances(
  closedCandles: readonly CandleBar[],
  input: { emaPeriod: number; cleanBars: number }
): EmaGridStance[] {
  if (
    !Number.isInteger(input.emaPeriod) ||
    input.emaPeriod < 1 ||
    !Number.isInteger(input.cleanBars) ||
    input.cleanBars < 1
  ) {
    return closedCandles.map(() => "none")
  }

  const averages = ema(
    closedCandles.map((candle) => candle.close),
    input.emaPeriod
  )
  let longFailures = 0
  let shortFailures = 0
  const stances: EmaGridStance[] = []

  for (let index = 0; index < closedCandles.length; index += 1) {
    const candle = closedCandles[index]
    const average = averages[index]
    if (!(candle.low > average)) longFailures += 1
    if (!(candle.high < average)) shortFailures += 1

    const expired = index - input.cleanBars
    if (expired >= 0) {
      const old = closedCandles[expired]
      const oldAverage = averages[expired]
      if (!(old.low > oldAverage)) longFailures -= 1
      if (!(old.high < oldAverage)) shortFailures -= 1
    }

    if (index + 1 < EMA_GRID_HISTORY_BARS || index + 1 < input.cleanBars) {
      stances.push("none")
    } else if (longFailures === 0) {
      stances.push("long")
    } else if (shortFailures === 0) {
      stances.push("short")
    } else {
      stances.push("none")
    }
  }

  return stances
}

/** The concrete range and ordinary Grid settings an EMA stance places. */
export function emaGridPlacement(
  settings: TradeGridSettings,
  direction: GridDirection,
  mark: number
): { topPx: number; bottomPx: number; params: GridParams } | null {
  const range = gridRangeFromClick({
    clickPx: mark,
    rangePct: settings.grid.rangePct,
    levels: settings.grid.levels,
    spacing: settings.grid.spacing,
    direction,
  })
  if (!range) return null

  const manualRungPcts = settings.grid.manualRungPcts
  const placedRungPcts =
    settings.grid.manualSizing && manualRungPcts
      ? direction === "short"
        ? [...manualRungPcts].reverse()
        : manualRungPcts
      : manualRungPcts

  return {
    ...range,
    params: {
      ...defaultGridParams(),
      ...settings.grid,
      direction,
      compound: true,
      maxOrderVolPct: 0,
      sizing: "even",
      manualSizing: settings.grid.manualSizing,
      manualRungPcts: placedRungPcts,
      anchor: "price",
      stopLoss: {
        underPct: settings.grid.stopLoss.underPct,
        base: null,
      },
      takeProfitPct: null,
      reverseWhenStopped: false,
    },
  }
}
