import {
  AUTOMATION_MAX_WINDOW_BARS,
  automationHtfInterval,
  automationIntervalRatio,
  dcaHistoryBars,
  type AutomationCondition,
  type AutomationConfig,
} from "@/lib/automations/automation"
import { INDICATORS, type IndicatorSelection } from "@/lib/indicators/registry"
import {
  qflHistoryBars,
  qflRequiredHistoryMonths,
} from "@/lib/automations/qfl"

function triggersOf(
  condition: AutomationCondition
): Extract<AutomationCondition, { kind: "trigger" }>[] {
  if (condition.kind === "trigger") return [condition]
  if (condition.kind === "liveWall") return []
  return condition.children.flatMap(triggersOf)
}

export function automationWarmupBars(config: AutomationConfig) {
  const triggers = config.rules.flatMap((rule) => triggersOf(rule.condition))
  const bars = (selection: IndicatorSelection, extra = 0) =>
    INDICATORS[selection.type].warmupBars(selection.params as never) + extra + 5
  return Math.max(
    5,
    ...(config.qfl
      ? [
          qflHistoryBars(
            config.qfl,
            config.interval,
            qflRequiredHistoryMonths(config.qfl, config.marketScanner)
          ),
        ]
      : []),
    ...(config.dca ? [dcaHistoryBars(config.dca, config.interval)] : []),
    ...triggers.flatMap((trigger) => [
      bars(trigger.indicator),
      // A Look Back filter must SEE a signal up to maxAgeBars old, so its
      // indicator needs its own warmup that far back in the window.
      // Higher-timeframe filters warm up on their OWN series (see
      // automationHtfWindowBars), not the base window.
      ...(trigger.filters ?? [])
        .filter((filter) => !filter.interval)
        .map((filter) => bars(filter.indicator, filter.maxAgeBars ?? 0)),
    ])
  )
}

/**
 * Bars of the automation's higher timeframe the engine must hold: the HTF
 * indicators' warmup plus enough HTF bars to cover the base evaluation
 * window, so every base bar has an HTF opinion. 0 when no HTF filter exists.
 */
export function automationHtfWindowBars(config: AutomationConfig): number {
  const htf = automationHtfInterval(config)
  if (!htf) return 0
  const ratio = automationIntervalRatio(config.interval, htf)
  if (!ratio) return 0
  const triggers = config.rules.flatMap((rule) => triggersOf(rule.condition))
  const warmup = Math.max(
    0,
    ...triggers.flatMap((trigger) =>
      (trigger.filters ?? [])
        .filter((filter) => filter.interval === htf)
        .map((filter) =>
          INDICATORS[filter.indicator.type].warmupBars(
            filter.indicator.params as never
          )
        )
    )
  )
  const baseWindow = Math.min(
    automationWarmupBars(config),
    AUTOMATION_MAX_WINDOW_BARS
  )
  return Math.min(
    AUTOMATION_MAX_WINDOW_BARS,
    warmup + Math.ceil(baseWindow / ratio) + 5
  )
}

/** One-line settings summary for automation cards and list rows. */
export function automationSummary(config: AutomationConfig): string {
  const parts = config.qfl
    ? [
        `QFL ${config.qfl.totalOrders} buys`,
        `max ${config.qfl.maxPortfolioExposurePct}%`,
        `TP ${config.qfl.takeProfitPct}%`,
      ]
    : [
        `${config.rules.length} ${config.rules.length === 1 ? "action" : "actions"}`,
      ]
  for (const side of ["long", "short"] as const) {
    const levels = config.protection[side]
    const tag = side === "long" ? "Long" : "Short"
    if (levels?.takeProfitPct) parts.push(`${tag} TP ${levels.takeProfitPct}%`)
    if (levels?.stopLossPct) {
      const sl =
        levels.stopLossMode === "trailing"
          ? `trailing SL ${levels.stopLossPct}%`
          : `SL ${levels.stopLossPct}%`
      parts.push(`${tag} ${sl}`)
    }
  }
  return parts.join(" · ")
}

/** Read-only label/value rows for the backtest Inputs rail. */
export function automationInputRows(
  config: AutomationConfig
): { label: string; value: string }[] {
  const level = (
    side: "long" | "short",
    key: "takeProfitPct" | "stopLossPct"
  ) => {
    const levels = config.protection[side]
    const value = levels?.[key]
    if (!value) return "off"
    if (key !== "stopLossPct" || levels?.stopLossMode !== "trailing") {
      return `${value}%`
    }
    const activation = levels.trailActivationPct
    return activation
      ? `${value}% trailing after +${activation}%`
      : `${value}% trailing`
  }
  return [
    { label: "Type", value: "Automation" },
    { label: "Actions", value: String(config.rules.length) },
    ...(config.qfl
      ? [
          { label: "QFL buys", value: String(config.qfl.totalOrders) },
          {
            label: "QFL maximum exposure",
            value: `${config.qfl.maxPortfolioExposurePct}%`,
          },
          {
            label: "QFL base respect",
            value: config.qfl.respectFilterEnabled
              ? `${config.qfl.minRespectPct}% over ${config.qfl.respectLookbackMonths} months`
              : "off",
          },
        ]
      : []),
    { label: "Long take profit", value: level("long", "takeProfitPct") },
    { label: "Long stop loss", value: level("long", "stopLossPct") },
    { label: "Short take profit", value: level("short", "takeProfitPct") },
    { label: "Short stop loss", value: level("short", "stopLossPct") },
  ]
}

/**
 * The hard take-profit bound (percent) a winning trade can never beat — the
 * largest take-profit across both sides. Feeds the backtest credibility
 * tripwire; null when no take-profit is set.
 */
export function automationTakeProfitPct(
  config: AutomationConfig
): number | null {
  const values = [
    config.qfl?.takeProfitPct,
    config.protection.long?.takeProfitPct,
    config.protection.short?.takeProfitPct,
  ].filter((value): value is number => value !== undefined)
  return values.length > 0 ? Math.max(...values) : null
}
