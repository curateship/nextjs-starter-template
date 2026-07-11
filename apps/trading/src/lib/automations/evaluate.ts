import type {
  IndicatorCandle,
  IndicatorOutput,
  IndicatorPaint,
} from "@/lib/indicators/contract"
import { INDICATORS } from "@/lib/indicators/registry"

import {
  resolveAutomationActions,
  type AutomationCondition,
  type AutomationStrategyConfig,
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
  return condition.kind === "trigger"
    ? [condition]
    : condition.children.flatMap(triggersOf)
}

function selectionKey(
  condition: Extract<AutomationCondition, { kind: "trigger" }>
) {
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
  config: AutomationStrategyConfig
): AutomationEvaluation {
  const triggers = config.rules.flatMap((rule) => triggersOf(rule.condition))
  const outputBySelection = new Map<string, IndicatorOutput>()
  const outputByNode = new Map<string, IndicatorOutput>()
  const paint = emptyPaint()

  for (const trigger of triggers) {
    const key = selectionKey(trigger)
    let output = outputBySelection.get(key)
    if (!output) {
      const module = INDICATORS[trigger.indicator.type]
      const params = module.paramsSchema.parse(trigger.indicator.params)
      output = module.compute(candles, params as never)
      outputBySelection.set(key, output)
      mergePaint(paint, output, trigger.nodeId)
    }
    outputByNode.set(trigger.nodeId, output)
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

  const actions: AutomationActionEvent[] = []
  const warnings: { time: number; message: string }[] = []
  for (const candle of candles) {
    const resolved = resolveAutomationActions(
      config.rules,
      firedByTime.get(candle.t) ?? new Set<string>()
    )
    if (resolved.action) actions.push({ time: candle.t, ...resolved.action })
    if (resolved.warning)
      warnings.push({ time: candle.t, message: resolved.warning })
  }
  return { paint, actions, warnings }
}
