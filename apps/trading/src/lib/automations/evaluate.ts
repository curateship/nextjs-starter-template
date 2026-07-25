import type {
  IndicatorCandle,
  IndicatorOutput,
  IndicatorPaint,
} from "@/lib/indicators/contract"
import { INDICATORS } from "@/lib/indicators/registry"
import { configNodeOverlays } from "@/lib/automations/node-registry"
import { ema } from "@/lib/strategies/indicators"
import { emaLines, indicatorColor } from "@/lib/trading/indicators-config"

import {
  AUTOMATION_INTERVAL_MS,
  automationFilterStateKey,
  automationHtfInterval,
  automationIntervalRatio,
  resolveAutomationActions,
  type AutomationCondition,
  type AutomationConfig,
  type AutomationFilter,
  type AutomationInterval,
  type ResolvedAutomationAction,
} from "./automation"

export type AutomationActionEvent = ResolvedAutomationAction & { time: number }

export type AutomationEvaluation = {
  paint: IndicatorPaint
  actions: AutomationActionEvent[]
  warnings: { time: number; message: string }[]
}

const emptyPaint = (): IndicatorPaint => ({
  indicators: [],
  lines: [],
  zones: [],
  barColors: [],
})

function triggersOf(
  condition: AutomationCondition
): Extract<AutomationCondition, { kind: "trigger" }>[] {
  if (condition.kind === "trigger") return [condition]
  if (condition.kind === "liveWall") return []
  return condition.children.flatMap(triggersOf)
}

function selectionKey(
  condition: {
    indicator: { type: string; params: Record<string, unknown> }
  },
  interval?: AutomationInterval
) {
  const params = Object.fromEntries(
    Object.entries(condition.indicator.params).sort(([a], [b]) =>
      a.localeCompare(b)
    )
  )
  // The interval is part of the identity: a 4h RSI and a 15m RSI with the
  // same params are different computations.
  return `${condition.indicator.type}:${interval ?? "base"}:${JSON.stringify(params)}`
}

/**
 * Aggregate base-interval candles into exact higher-timeframe candles.
 * Complete buckets only — a partial bucket would fake a closed HTF candle.
 * Used ONLY by paint callers that omit the real HTF series; the engine
 * (live worker and backtest) always passes real HTF candles.
 */
export function resampleAutomationCandles(
  candles: IndicatorCandle[],
  base: AutomationInterval,
  htf: AutomationInterval
): IndicatorCandle[] {
  const ratio = automationIntervalRatio(base, htf)
  if (!ratio) return []
  const htfMs = AUTOMATION_INTERVAL_MS[htf]
  const buckets = new Map<number, IndicatorCandle & { count: number }>()
  for (const candle of candles) {
    const t = Math.floor(candle.t / htfMs) * htfMs
    const bucket = buckets.get(t)
    if (!bucket) {
      buckets.set(t, { ...candle, t, count: 1 })
      continue
    }
    bucket.h = Math.max(bucket.h, candle.h)
    bucket.l = Math.min(bucket.l, candle.l)
    bucket.c = candle.c
    bucket.v += candle.v
    bucket.count += 1
  }
  return [...buckets.values()]
    .filter((bucket) => bucket.count === ratio)
    .sort((a, b) => a.t - b.t)
    .map((bucket) => ({
      t: bucket.t,
      o: bucket.o,
      h: bucket.h,
      l: bucket.l,
      c: bucket.c,
      v: bucket.v,
    }))
}

/**
 * Step an HTF node's painted lines onto the base candle grid, holding each
 * value from the first base candle that could actually SEE it (the HTF
 * candle's close) — the chart shows what the bot knew and when.
 */
function stepLinesOntoBase(
  output: IndicatorOutput,
  htfCandles: IndicatorCandle[],
  htfInterval: AutomationInterval,
  htfMs: number,
  baseCandles: IndicatorCandle[]
): IndicatorOutput {
  // Chart-native overlay configs (`indicators`) are computed by the chart at
  // ITS timeframe — silently wrong values for an HTF node. EMA configs are
  // converted here into concrete lines computed on the real HTF candles, so
  // an EMA cross behind a Timeframe gate still paints (labeled with its
  // clock). Other native paint (oscillators, zones, bar colors) stays
  // dropped in v1.
  const sourceLines = [...output.paint.lines]
  const closes = htfCandles.map((candle) => candle.c)
  for (const indicator of output.paint.indicators) {
    if (indicator.type !== "ema") continue
    const params = indicator.params as Record<string, number>
    for (const def of emaLines(params)) {
      const values = ema(closes, params[def.periodKey])
      sourceLines.push({
        id: `${indicator.id}:${def.slot}`,
        label: `EMA ${params[def.periodKey]} · ${htfInterval}`,
        color: indicatorColor(def.slot, false),
        points: htfCandles.flatMap((candle, index) =>
          Number.isFinite(values[index])
            ? [{ time: candle.t, value: values[index] }]
            : []
        ),
      })
    }
  }
  const lines = sourceLines.map((line) => {
    const sorted = [...line.points].sort((a, b) => a.time - b.time)
    const points: { time: number; value: number }[] = []
    let index = -1
    for (const candle of baseCandles) {
      while (
        index + 1 < sorted.length &&
        sorted[index + 1].time + htfMs <= candle.t
      ) {
        index++
      }
      if (index >= 0) points.push({ time: candle.t, value: sorted[index].value })
    }
    return { ...line, points }
  })
  return {
    signals: output.signals,
    // Chart-native overlay configs (`indicators`) are computed by the chart
    // at ITS timeframe, so they would silently show wrong values for an HTF
    // node — dropped in v1, along with zones/bar colors.
    paint: { indicators: [], lines, zones: [], barColors: [] },
  }
}

function mergePaint(
  target: IndicatorPaint,
  output: IndicatorOutput,
  prefix: string
) {
  target.indicators.push(
    ...output.paint.indicators.map((indicator) => ({
      ...indicator,
      id: `${prefix}:${indicator.id}`,
    }))
  )
  target.lines.push(
    ...output.paint.lines.map((line) => ({
      ...line,
      id: `${prefix}:${line.id}`,
    }))
  )
  target.zones.push(
    ...output.paint.zones.map((zone) => ({
      ...zone,
      id: `${prefix}:${zone.id}`,
    }))
  )
  target.barColors.push(...output.paint.barColors)
}

export function automationFiltersAllowBuy(
  candles: IndicatorCandle[],
  filters: AutomationFilter[]
): boolean {
  if (filters.length === 0) return true
  const lastTime = candles.at(-1)?.t
  if (lastTime === undefined) return false
  const indexByTime = new Map(candles.map((candle, index) => [candle.t, index]))
  const lastIndex = candles.length - 1
  return filters.every((filter) => {
    const module = INDICATORS[filter.indicator.type]
    const params = module.paramsSchema.parse(filter.indicator.params)
    const latest = module
      .compute(candles, params as never)
      .signals.filter((signal) => signal.time <= lastTime)
      .at(-1)
    const signalIndex = latest ? indexByTime.get(latest.time) : undefined
    return (
      latest?.side === "buy" &&
      signalIndex !== undefined &&
      (filter.maxAgeBars === undefined ||
        lastIndex - signalIndex < filter.maxAgeBars)
    )
  })
}

export function evaluateAutomation(
  candles: IndicatorCandle[],
  config: AutomationConfig,
  htfCandles?: IndicatorCandle[]
): AutomationEvaluation {
  const triggers = config.rules.flatMap((rule) => triggersOf(rule.condition))
  const filters = triggers.flatMap((trigger) => trigger.filters ?? [])
  const outputBySelection = new Map<string, IndicatorOutput>()
  // Keyed by node-and-clock (automationFilterStateKey): one node can trigger
  // on the bot timeframe AND gate through a Timeframe node — two separate
  // computations of the same indicator.
  const outputByKey = new Map<string, IndicatorOutput>()
  const paint = emptyPaint()

  // Higher-timeframe series: engine callers (live worker, backtest runner)
  // pass the real CLOSED HTF candles; paint callers omit the argument and
  // get an exact resample of the base candles instead. The alignment guard
  // drops any vendor row not stamped on an epoch multiple of the interval,
  // so a misaligned candle can only disappear, never shift the clock.
  const htfInterval = automationHtfInterval(config)
  const htfMs = htfInterval ? AUTOMATION_INTERVAL_MS[htfInterval] : 0
  const htfSeries = htfInterval
    ? (
        htfCandles ??
        resampleAutomationCandles(candles, config.interval, htfInterval)
      ).filter((candle) => candle.t % htfMs === 0)
    : []

  // Base dashes (and any future node overlay) come from the node registry, so a
  // DCA run draws its base the same way a QFL run does — no strategy hardcoded
  // here. Each strategy node declares its own `overlays`.
  paint.indicators.push(...configNodeOverlays(config))

  for (const source of [...triggers, ...filters]) {
    const sourceInterval = "side" in source ? undefined : source.interval
    const htf =
      sourceInterval !== undefined && sourceInterval !== config.interval
    const stateKey = automationFilterStateKey({
      nodeId: source.nodeId,
      interval: htf ? sourceInterval : undefined,
    })
    if (outputByKey.has(stateKey)) continue
    const key = selectionKey(source, htf ? sourceInterval : undefined)
    let output = outputBySelection.get(key)
    if (!output) {
      const module = INDICATORS[source.indicator.type]
      const params = module.paramsSchema.parse(source.indicator.params)
      const computed = module.compute(htf ? htfSeries : candles, params as never)
      output = htf
        ? stepLinesOntoBase(
            computed,
            htfSeries,
            sourceInterval as AutomationInterval,
            htfMs,
            candles
          )
        : computed
      outputBySelection.set(key, output)
      // Both roles of one node may paint; the clock in the prefix keeps
      // their chart series ids distinct.
      mergePaint(paint, output, stateKey)
    }
    outputByKey.set(stateKey, output)
  }

  const firedByTime = new Map<number, Set<string>>()
  for (const trigger of triggers) {
    // Triggers always run on the bot timeframe — the base-clock output.
    const output = outputByKey.get(trigger.nodeId)
    for (const signal of output?.signals ?? []) {
      const fired = firedByTime.get(signal.time) ?? new Set<string>()
      fired.add(`${trigger.nodeId}:${signal.side}`)
      firedByTime.set(signal.time, fired)
    }
  }

  // Trend filters latch: a filter counts as bullish/bearish from its most
  // recent signal (same candle included) until the opposite signal — subject
  // to any Look Back cap, which the resolver checks against the latch age.
  // A higher-timeframe signal's time is shifted to its candle's CLOSE, so it
  // first latches on the base candle that OPENS at or after that close —
  // the no-lookahead rule (see Key-Features/higher-timeframe-filter.md).
  const uniqueFilterKeys = new Map<string, AutomationFilter>()
  for (const filter of filters) {
    const key = automationFilterStateKey(filter)
    if (!uniqueFilterKeys.has(key)) uniqueFilterKeys.set(key, filter)
  }
  const filterCursors = [...uniqueFilterKeys.entries()].map(
    ([stateKey, filter]) => {
      const htf =
        filter.interval !== undefined && filter.interval !== config.interval
      return {
        stateKey,
        signals: [...(outputByKey.get(stateKey)?.signals ?? [])]
          .map((signal) =>
            htf ? { ...signal, time: signal.time + htfMs } : signal
          )
          .sort((a, b) => a.time - b.time),
        index: 0,
      }
    }
  )
  const latched = new Map<string, { side: "buy" | "sell"; barIndex: number }>()

  const actions: AutomationActionEvent[] = []
  const warnings: { time: number; message: string }[] = []
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]
    for (const cursor of filterCursors) {
      while (
        cursor.index < cursor.signals.length &&
        cursor.signals[cursor.index].time <= candle.t
      ) {
        latched.set(cursor.stateKey, {
          side: cursor.signals[cursor.index].side,
          barIndex: i,
        })
        cursor.index++
      }
    }
    const filterState = new Map<string, { side: "buy" | "sell"; age: number }>()
    for (const [stateKey, latch] of latched) {
      filterState.set(stateKey, { side: latch.side, age: i - latch.barIndex })
    }
    const resolved = resolveAutomationActions(
      config.rules,
      firedByTime.get(candle.t) ?? new Set<string>(),
      filterState
    )
    if (resolved.action) actions.push({ time: candle.t, ...resolved.action })
    if (resolved.warning)
      warnings.push({ time: candle.t, message: resolved.warning })
  }
  return { paint, actions, warnings }
}
