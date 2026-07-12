import {
  automationStrategyConfigSchema,
  type AutomationCondition,
  type AutomationStrategyConfig,
} from "@/lib/automations/automation"
import { INDICATORS, type IndicatorSelection } from "@/lib/indicators/registry"

import { eraseKind, type StrategyKindModule } from "./contract"

function triggersOf(
  condition: AutomationCondition
): Extract<AutomationCondition, { kind: "trigger" }>[] {
  return condition.kind === "trigger"
    ? [condition]
    : condition.children.flatMap(triggersOf)
}

export function automationWarmupBars(config: AutomationStrategyConfig) {
  const triggers = config.rules.flatMap((rule) => triggersOf(rule.condition))
  const bars = (selection: IndicatorSelection, extra = 0) =>
    INDICATORS[selection.type].warmupBars(selection.params as never) +
    extra +
    5
  return Math.max(
    5,
    ...triggers.flatMap((trigger) => [
      bars(trigger.indicator),
      // A Look Back filter must SEE a signal up to maxAgeBars old, so its
      // indicator needs its own warmup that far back in the window.
      ...(trigger.filters ?? []).map((filter) =>
        bars(filter.indicator, filter.maxAgeBars ?? 0)
      ),
    ])
  )
}

const automationKindModule: StrategyKindModule<AutomationStrategyConfig> = {
  kind: "automation",
  availableInStrategyEditor: false,
  configSchema: automationStrategyConfigSchema,
  typeIds: () => ["automation"],
  typeOf: () => "automation",
  typeLabel: () => "Automation",
  typeDescription: () =>
    "Chains indicator trend filters into signal triggers with percentage-sized trading actions.",
  defaultConfig: (_typeId, interval) => ({
    v: 2,
    kind: "automation",
    interval,
    protection: {},
    rules: [
      {
        id: "buy",
        action: "buy",
        targetEquityPct: 10,
        condition: {
          kind: "trigger",
          nodeId: "ema-cross",
          indicator: { type: "ema_cross", params: { fast: 20, slow: 50 } },
          side: "buy",
        },
      },
    ],
  }),
  paramFields: [],
  summary: (config) => {
    const parts = [
      `${config.rules.length} ${config.rules.length === 1 ? "action" : "actions"}`,
    ]
    if (config.protection.takeProfitPct) {
      parts.push(`TP ${config.protection.takeProfitPct}%`)
    }
    if (config.protection.stopLossPct) {
      parts.push(`SL ${config.protection.stopLossPct}%`)
    }
    return parts.join(" · ")
  },
  inputRows: (config) => [
    { label: "Strategy", value: "Automation" },
    { label: "Actions", value: String(config.rules.length) },
    {
      label: "Take profit",
      value: config.protection.takeProfitPct
        ? `${config.protection.takeProfitPct}%`
        : "off",
    },
    {
      label: "Stop loss",
      value: config.protection.stopLossPct
        ? `${config.protection.stopLossPct}%`
        : "off",
    },
  ],
  warmupBars: automationWarmupBars,
  takeProfitPct: (config) => config.protection.takeProfitPct ?? null,
}

export const automationKind = eraseKind(automationKindModule)
