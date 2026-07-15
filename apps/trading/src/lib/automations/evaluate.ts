import type {
  IndicatorCandle,
  IndicatorOutput,
  IndicatorPaint,
} from "@/lib/indicators/contract"
import { INDICATORS } from "@/lib/indicators/registry"

import {
  resolveAutomationActions,
  type AutomationCondition,
  type AutomationConfig,
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

function selectionKey(condition: {
  indicator: { type: string; params: Record<string, unknown> }
}) {
  const params = Object.fromEntries(
    Object.entries(condition.indicator.params).sort(([a], [b]) =>
      a.localeCompare(b)
    )
  )
  return `${condition.indicator.type}:${JSON.stringify(params)}`
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

export function evaluateAutomation(
  candles: IndicatorCandle[],
  config: AutomationConfig
): AutomationEvaluation {
  const triggers = config.rules.flatMap((rule) => triggersOf(rule.condition))
  const filters = triggers.flatMap((trigger) => trigger.filters ?? [])
  const outputBySelection = new Map<string, IndicatorOutput>()
  const outputByNode = new Map<string, IndicatorOutput>()
  const paint = emptyPaint()

  for (const source of [...triggers, ...filters]) {
    const key = selectionKey(source)
    let output = outputBySelection.get(key)
    if (!output) {
      const module = INDICATORS[source.indicator.type]
      const params = module.paramsSchema.parse(source.indicator.params)
      output = module.compute(candles, params as never)
      outputBySelection.set(key, output)
      mergePaint(paint, output, source.nodeId)
    }
    outputByNode.set(source.nodeId, output)
  }

  const firedByTime = new Map<number, Set<string>>()
  for (const trigger of triggers) {
    const output = outputByNode.get(trigger.nodeId)
    for (const signal of output?.signals ?? []) {
      const fired = firedByTime.get(signal.time) ?? new Set<string>()
      fired.add(`${trigger.nodeId}:${signal.side}`)
      firedByTime.set(signal.time, fired)
    }
  }

  // Trend filters latch: a filter counts as bullish/bearish from its most
  // recent signal (same candle included) until the opposite signal — subject
  // to any Look Back cap, which the resolver checks against the latch age.
  const filterCursors = [
    ...new Set(filters.map((filter) => filter.nodeId)),
  ].map((nodeId) => ({
    nodeId,
    signals: [...(outputByNode.get(nodeId)?.signals ?? [])].sort(
      (a, b) => a.time - b.time
    ),
    index: 0,
  }))
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
        latched.set(cursor.nodeId, {
          side: cursor.signals[cursor.index].side,
          barIndex: i,
        })
        cursor.index++
      }
    }
    const filterState = new Map<string, { side: "buy" | "sell"; age: number }>()
    for (const [nodeId, latch] of latched) {
      filterState.set(nodeId, { side: latch.side, age: i - latch.barIndex })
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
