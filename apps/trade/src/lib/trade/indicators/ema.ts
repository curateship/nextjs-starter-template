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

const EMA_FIELDS: IndicatorField[] = [
  {
    key: "show20",
    label: "Show on chart",
    hint: "Hide or show the 20 candle line without changing any trade calls.",
    kind: "switch",
    fallback: true,
  },
  {
    key: "period20",
    label: "EMA 20 candles",
    hint: "How many candle closes make the first average.",
    kind: "number",
    min: 1,
    max: 1_000,
    fallback: 20,
  },
  {
    key: "color20",
    label: "Color",
    hint: "The color of the 20 candle line.",
    kind: "color",
    fallback: "#2563eb",
  },
  {
    key: "period50",
    label: "EMA 50 candles",
    hint: "How many candle closes make the second average.",
    kind: "number",
    min: 1,
    max: 1_000,
    fallback: 50,
  },
  {
    key: "show50",
    label: "Show on chart",
    hint: "Hide or show the 50 candle line. The 50 / 200 call stays on.",
    kind: "switch",
    fallback: true,
  },
  {
    key: "period200",
    label: "EMA 200 candles",
    hint: "How many candle closes make the third average.",
    kind: "number",
    min: 1,
    max: 1_000,
    fallback: 200,
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
    label: "Cross signals",
    hint: "Hide or show crossover arrows without changing automation calls.",
    kind: "switch",
    fallback: true,
  },
  {
    key: "signalPair",
    label: "Arrow when these cross",
    hint: "Choose which two averages make the buy and sell arrows.",
    kind: "choice",
    options: [
      { value: "fast-medium", label: "20 × 50" },
      { value: "fast-slow", label: "20 × 200" },
      { value: "medium-slow", label: "50 × 200" },
    ],
    fallback: "medium-slow",
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
    period20: read.period20 as number,
    color20: String(read.color20),
    show50: read.show50 === true,
    period50: read.period50 as number,
    color50: String(read.color50),
    show200: read.show200 === true,
    period200: read.period200 as number,
    color200: String(read.color200),
    showSignals: read.showSignals === true,
    signalPair: String(read.signalPair),
  }
}

function emaReading(candles: IndicatorCandle[], params: IndicatorParams) {
  const settings = emaSettings(params)
  const closes = candles.map((candle) => candle.close)
  return {
    fast: ema(closes, settings.period20),
    medium: ema(closes, settings.period50),
    slow: ema(closes, settings.period200),
  }
}

function signalPeriods(settings: ReturnType<typeof emaSettings>) {
  if (settings.signalPair === "fast-medium")
    return [settings.period20, settings.period50] as const
  if (settings.signalPair === "fast-slow")
    return [settings.period20, settings.period200] as const
  return [settings.period50, settings.period200] as const
}

function crossEvents(
  candles: IndicatorCandle[],
  medium: number[],
  slow: number[],
  firstPeriod: number,
  secondPeriod: number
): EmaEvent[] {
  const events: EmaEvent[] = []
  for (
    let index = Math.max(firstPeriod, secondPeriod);
    index < candles.length;
    index += 1
  ) {
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

function eventsOf(
  candles: IndicatorCandle[],
  params: IndicatorParams
): EmaEvent[] {
  const settings = emaSettings(params)
  const [firstPeriod, secondPeriod] = signalPeriods(settings)
  const closes = candles.map((candle) => candle.close)
  return crossEvents(
    candles,
    ema(closes, firstPeriod),
    ema(closes, secondPeriod),
    firstPeriod,
    secondPeriod
  )
}

export const emaIndicator: IndicatorModule = {
  kind: "ema",
  label: "EMA 20 / 50 / 200",
  description:
    "Draws the 20, 50 and 200 candle averages, with a buy or sell arrow when the 50 and 200 lines cross.",
  fields: EMA_FIELDS,
  groups: [
    { title: "EMA 20", keys: ["show20", "period20", "color20"] },
    { title: "EMA 50", keys: ["show50", "period50", "color50"] },
    { title: "EMA 200", keys: ["show200", "period200", "color200"] },
    { title: "Signals", keys: ["showSignals", "signalPair"] },
  ],
  compute: (candles, params) => {
    const settings = emaSettings(params)
    const reading = emaReading(candles, params)
    const events = settings.showSignals ? eventsOf(candles, params) : []
    return {
      lines: [
        settings.show20
          ? lineOf(candles, reading.fast, settings.period20, settings.color20)
          : null,
        settings.show50
          ? lineOf(candles, reading.medium, settings.period50, settings.color50)
          : null,
        settings.show200
          ? lineOf(candles, reading.slow, settings.period200, settings.color200)
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
  signals: (candles, params) =>
    eventsOf(candles, params).map((event) => event.signal),
  warmupBars: (params) => {
    const settings = emaSettings(params)
    return Math.max(...signalPeriods(settings)) * 3
  },
}
