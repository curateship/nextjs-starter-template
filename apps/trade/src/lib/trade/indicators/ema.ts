import type {
  IndicatorCandle,
  IndicatorField,
  IndicatorLine,
  IndicatorMark,
  IndicatorModule,
  IndicatorSignal,
  IndicatorParams,
} from "@/lib/trade/indicators/contract"
import { readIndicatorParams } from "@/lib/trade/indicators/contract"

const FAST_PERIOD = 20
const CROSS_PERIOD = 50
const SLOW_PERIOD = 200

const EMA_FIELDS: IndicatorField[] = [
  {
    key: "show20",
    label: "Show on chart",
    hint: "Hide or show the 20 candle line without changing any trade calls.",
    kind: "switch",
    fallback: true,
  },
  {
    key: "color20",
    label: "Color",
    hint: "The color of the 20 candle line.",
    kind: "color",
    fallback: "#2563eb",
  },
  {
    key: "show50",
    label: "Show on chart",
    hint: "Hide or show the 50 candle line. The 50 / 200 call stays on.",
    kind: "switch",
    fallback: true,
  },
  {
    key: "color50",
    label: "Color",
    hint: "The color of the 50 candle line.",
    kind: "color",
    fallback: "#ea580c",
  },
  {
    key: "show200",
    label: "Show on chart",
    hint: "Hide or show the 200 candle line. The 50 / 200 call stays on.",
    kind: "switch",
    fallback: true,
  },
  {
    key: "color200",
    label: "Color",
    hint: "The color of the 200 candle line.",
    kind: "color",
    fallback: "#16a34a",
  },
  {
    key: "showSignals",
    label: "Show buy / sell arrows",
    hint: "Hide or show crossover arrows without changing automation calls.",
    kind: "switch",
    fallback: true,
  },
]

type EmaEvent = IndicatorMark & { signal: IndicatorSignal }

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return []
  const weight = 2 / (period + 1)
  const result: number[] = []
  let previous = values[0]
  for (const value of values) {
    previous = value * weight + previous * (1 - weight)
    result.push(previous)
  }
  return result
}

function lineOf(
  candles: IndicatorCandle[],
  values: number[],
  period: number,
  color: string
): IndicatorLine {
  return {
    id: `ema-${period}`,
    color,
    points: candles.slice(period - 1).map((candle, offset) => ({
      time: candle.openTime,
      price: values[offset + period - 1],
    })),
  }
}

function emaSettings(params: IndicatorParams) {
  const read = readIndicatorParams(EMA_FIELDS, params)
  return {
    show20: read.show20 === true,
    color20: String(read.color20),
    show50: read.show50 === true,
    color50: String(read.color50),
    show200: read.show200 === true,
    color200: String(read.color200),
    showSignals: read.showSignals === true,
  }
}

function emaReading(candles: IndicatorCandle[]) {
  const closes = candles.map((candle) => candle.close)
  return {
    fast: ema(closes, FAST_PERIOD),
    cross: ema(closes, CROSS_PERIOD),
    slow: ema(closes, SLOW_PERIOD),
  }
}

function crossEvents(
  candles: IndicatorCandle[],
  medium: number[],
  slow: number[]
): EmaEvent[] {
  const events: EmaEvent[] = []
  for (let index = SLOW_PERIOD; index < candles.length; index += 1) {
    const crossedUp =
      medium[index - 1] <= slow[index - 1] && medium[index] > slow[index]
    const crossedDown =
      medium[index - 1] >= slow[index - 1] && medium[index] < slow[index]
    if (!crossedUp && !crossedDown) continue
    const side = crossedUp ? "up" : "down"
    events.push({
      time: candles[index].openTime,
      price: candles[index].close,
      side,
      signal: {
        time: candles[index].openTime,
        side: crossedUp ? "buy" : "sell",
      },
    })
  }
  return events
}

function eventsOf(candles: IndicatorCandle[]): EmaEvent[] {
  const closes = candles.map((candle) => candle.close)
  return crossEvents(
    candles,
    ema(closes, CROSS_PERIOD),
    ema(closes, SLOW_PERIOD)
  )
}

export const emaIndicator: IndicatorModule = {
  kind: "ema",
  label: "EMA 20 / 50 / 200",
  description:
    "Draws the 20, 50 and 200 candle averages, with a buy or sell arrow when the 50 and 200 lines cross.",
  fields: EMA_FIELDS,
  groups: [
    { title: "EMA 20", keys: ["show20", "color20"] },
    { title: "EMA 50", keys: ["show50", "color50"] },
    { title: "EMA 200", keys: ["show200", "color200"] },
    { title: "Signals", keys: ["showSignals"] },
  ],
  compute: (candles, params) => {
    const settings = emaSettings(params)
    const reading = emaReading(candles)
    const events = settings.showSignals
      ? crossEvents(candles, reading.cross, reading.slow)
      : []
    return {
      lines: [
        settings.show20
          ? lineOf(candles, reading.fast, FAST_PERIOD, settings.color20)
          : null,
        settings.show50
          ? lineOf(candles, reading.cross, CROSS_PERIOD, settings.color50)
          : null,
        settings.show200
          ? lineOf(candles, reading.slow, SLOW_PERIOD, settings.color200)
          : null,
      ].filter((line): line is IndicatorLine => line !== null),
      dashes: [],
      marks: settings.showSignals
        ? events.map((event) => ({
            time: event.time,
            price: event.price,
            side: event.side,
          }))
        : [],
      boxes: [],
    }
  },
  signals: (candles) => eventsOf(candles).map((event) => event.signal),
  warmupBars: () => SLOW_PERIOD * 3,
}
