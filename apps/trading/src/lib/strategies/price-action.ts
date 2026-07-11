import { computeSwings } from "./qqe"

export type PriceActionPattern =
  | "hammer"
  | "shootingStar"
  | "bullishEngulfing"
  | "bearishEngulfing"
  | "liquiditySweepLow"
  | "liquiditySweepHigh"
  | "breakOfStructureUp"
  | "breakOfStructureDown"

export type PriceActionSignal = {
  index: number
  side: "bull" | "bear"
  pattern: PriceActionPattern
}

export type PriceActionOptions = {
  bullHammer: boolean
  bearShootingStar: boolean
  bullEngulfing: boolean
  bearEngulfing: boolean
  bullSweep: boolean
  bearSweep: boolean
  bullBos: boolean
  bearBos: boolean
  wickBodyRatio: number
  extremeLookback: number
  sweepLookback: number
  swingLookback: number
  maxSignals: number
}

const BODY_ZONE = 1 / 3

const DEFAULT_OPTIONS: PriceActionOptions = {
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
  maxSignals: 300,
}

const TOGGLE_KEYS = [
  "bullHammer",
  "bearShootingStar",
  "bullEngulfing",
  "bearEngulfing",
  "bullSweep",
  "bearSweep",
  "bullBos",
  "bearBos",
] as const

export function priceActionOptionsFromParams(
  params: Record<string, number>
): PriceActionOptions {
  const options = { ...DEFAULT_OPTIONS }
  for (const key of TOGGLE_KEYS) {
    options[key] = (params[key] ?? 1) !== 0
  }
  options.wickBodyRatio = params.wickBodyRatio ?? options.wickBodyRatio
  options.extremeLookback = params.extremeLookback ?? options.extremeLookback
  options.sweepLookback = params.sweepLookback ?? options.sweepLookback
  options.swingLookback = params.swingLookback ?? options.swingLookback
  return options
}

export function detectPriceAction(
  candles: {
    o: number | string
    h: number | string
    l: number | string
    c: number | string
  }[],
  options: PriceActionOptions
): PriceActionSignal[] {
  const open = candles.map((candle) => Number(candle.o))
  const high = candles.map((candle) => Number(candle.h))
  const low = candles.map((candle) => Number(candle.l))
  const close = candles.map((candle) => Number(candle.c))
  const { swingHigh, swingLow } = computeSwings(candles, options.swingLookback)
  const signals: PriceActionSignal[] = []
  let activeSwingHigh = Number.NaN
  let activeSwingLow = Number.NaN
  let highBroken = false
  let lowBroken = false

  for (let i = 0; i < candles.length; i += 1) {
    const body = Math.abs(close[i] - open[i])
    const range = high[i] - low[i]
    const lowerWick = Math.min(open[i], close[i]) - low[i]
    const upperWick = high[i] - Math.max(open[i], close[i])

    if (range > 0 && i >= options.extremeLookback) {
      const priorLow = Math.min(...low.slice(i - options.extremeLookback, i))
      const priorHigh = Math.max(...high.slice(i - options.extremeLookback, i))
      if (
        options.bullHammer &&
        close[i] > open[i] &&
        lowerWick >= options.wickBodyRatio * body &&
        Math.min(open[i], close[i]) >= high[i] - range * BODY_ZONE &&
        low[i] < priorLow &&
        i + 3 < candles.length &&
        close[i + 1] > open[i + 1] &&
        close[i + 2] > open[i + 2]
      ) {
        signals.push({ index: i + 3, side: "bull", pattern: "hammer" })
      }
      if (
        options.bearShootingStar &&
        close[i] < open[i] &&
        upperWick >= options.wickBodyRatio * body &&
        Math.max(open[i], close[i]) <= low[i] + range * BODY_ZONE &&
        high[i] > priorHigh &&
        i + 3 < candles.length &&
        close[i + 1] < open[i + 1] &&
        close[i + 2] < open[i + 2]
      ) {
        signals.push({ index: i + 3, side: "bear", pattern: "shootingStar" })
      }
    }

    if (i > options.extremeLookback) {
      const priorLow = Math.min(
        ...low.slice(i - options.extremeLookback - 1, i - 1)
      )
      const priorHigh = Math.max(
        ...high.slice(i - options.extremeLookback - 1, i - 1)
      )
      const pairLow = Math.min(low[i - 1], low[i])
      const pairHigh = Math.max(high[i - 1], high[i])
      if (
        options.bullEngulfing &&
        close[i - 1] < open[i - 1] &&
        close[i] > open[i] &&
        open[i] < close[i - 1] &&
        close[i] > open[i - 1] &&
        pairLow < priorLow
      ) {
        signals.push({ index: i, side: "bull", pattern: "bullishEngulfing" })
      }
      if (
        options.bearEngulfing &&
        close[i - 1] > open[i - 1] &&
        close[i] < open[i] &&
        open[i] > close[i - 1] &&
        close[i] < open[i - 1] &&
        pairHigh > priorHigh
      ) {
        signals.push({ index: i, side: "bear", pattern: "bearishEngulfing" })
      }
    }

    if (i >= options.sweepLookback) {
      const priorLow = Math.min(...low.slice(i - options.sweepLookback, i))
      const priorHigh = Math.max(...high.slice(i - options.sweepLookback, i))
      if (options.bullSweep && low[i] < priorLow && close[i] > priorLow) {
        signals.push({ index: i, side: "bull", pattern: "liquiditySweepLow" })
      }
      if (options.bearSweep && high[i] > priorHigh && close[i] < priorHigh) {
        signals.push({ index: i, side: "bear", pattern: "liquiditySweepHigh" })
      }
    }

    if (Number.isFinite(swingHigh[i]) && swingHigh[i] !== activeSwingHigh) {
      activeSwingHigh = swingHigh[i]
      highBroken = false
    }
    if (Number.isFinite(swingLow[i]) && swingLow[i] !== activeSwingLow) {
      activeSwingLow = swingLow[i]
      lowBroken = false
    }
    if (
      options.bullBos &&
      !highBroken &&
      Number.isFinite(activeSwingHigh) &&
      close[i] > activeSwingHigh
    ) {
      signals.push({ index: i, side: "bull", pattern: "breakOfStructureUp" })
      highBroken = true
    }
    if (
      options.bearBos &&
      !lowBroken &&
      Number.isFinite(activeSwingLow) &&
      close[i] < activeSwingLow
    ) {
      signals.push({ index: i, side: "bear", pattern: "breakOfStructureDown" })
      lowBroken = true
    }
  }

  return options.maxSignals === 0 ? [] : signals.slice(-options.maxSignals)
}
