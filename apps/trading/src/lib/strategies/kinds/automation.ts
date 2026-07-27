import {
  AUTOMATION_MAX_WINDOW_BARS,
  automationHtfInterval,
  automationIntervalRatio,
  dcaHistoryBars,
  SESSION_STOP_WINDOW_BARS,
  type AutomationCondition,
  type AutomationConfig,
} from "@/lib/automations/automation"
import { sessionLabel } from "@/lib/trading/sessions"
import { INDICATORS, type IndicatorSelection } from "@/lib/indicators/registry"

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
  const sessionStop =
    config.protection.long?.stopLossLevel ||
    config.protection.short?.stopLossLevel
  return Math.max(
    5,
    // A stop sitting at the session open has to reach back to that session's
    // first candle, whether or not any indicator asked for that much history.
    ...(sessionStop ? [SESSION_STOP_WINDOW_BARS] : []),
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
  const parts = config.dca
    ? [
        `DCA ${config.dca.rungs.length} buys`,
        `max ${config.dca.maxPositionPct}%`,
      ]
    : [
        `${config.rules.length} ${config.rules.length === 1 ? "action" : "actions"}`,
      ]
  for (const side of ["long", "short"] as const) {
    const levels = config.protection[side]
    const tag = side === "long" ? "Long" : "Short"
    if (levels?.takeProfitRr) {
      parts.push(`${tag} TP ${levels.takeProfitRr}:1`)
    } else if (levels?.takeProfitPct) {
      parts.push(`${tag} TP ${levels.takeProfitPct}%`)
    }
    if (levels?.stopLossPct) {
      const sl = levels.stopLossLevel
        ? "SL at the session open"
        : levels.stopLossMode === "trailing"
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
    if (key === "takeProfitPct" && levels?.takeProfitRr) {
      // The ratio is measured against the stop the trade actually got, so the
      // percent beside it is only what an outside-session trade would use.
      return `${levels.takeProfitRr}:1 against the stop (${value}% outside the session)`
    }
    if (key === "stopLossPct" && levels?.stopLossLevel) {
      return `at the ${sessionLabel(levels.stopLossLevel.session)} open (${value}% outside it)`
    }
    if (key === "takeProfitPct") {
      // Rung modes sell against the DCA ladder and IGNORE this percent, so
      // showing the bare number would misreport what actually ran.
      switch (levels?.takeProfitMode) {
        case "previousRungSellAll":
          return "at the previous rung (percent ignored)"
        case "nearestRungSellAll":
          return "everything at the nearest rung (percent ignored)"
        case "moneyBackThenBase":
          return `money back at the nearest rung, rest rides free (percent ignored)`
        default:
          return `${value}% above the average`
      }
    }
    if (key !== "stopLossPct" || levels?.stopLossMode !== "trailing") {
      return `${value}%${levels?.stopAnchor === "first" ? " from the first buy" : ""}`
    }
    const activation = levels.trailActivationPct
    return activation
      ? `${value}% trailing after +${activation}%`
      : `${value}% trailing`
  }
  return [
    { label: "Type", value: "Automation" },
    { label: "Actions", value: String(config.rules.length) },
    ...(config.dca
      ? [
          {
            label: "DCA base",
            value: `${config.dca.basePeriods} back / ${config.dca.pumpPeriods} hold`,
          },
          {
            label: "DCA crack",
            value: `${config.dca.crackPct}% below base within ${config.dca.maxCrackBars} candles`,
          },
          {
            label: "DCA buys",
            value: `${config.dca.rungs.length} at ${config.dca.rungs
              .map((rung) => `-${rung.deviation}%`)
              .join(", ")}`,
          },
          {
            label: "DCA maximum position",
            value: `${config.dca.maxPositionPct}%`,
          },
          {
            label: "DCA size ramp",
            value:
              config.dca.sizeMultiplier === 1
                ? "equal buys"
                : `${config.dca.sizeMultiplier}x each buy`,
          },
          {
            label: "DCA rung entry",
            value: `${config.dca.rungEntry}${
              config.dca.requireTwoGreen ? ", after 2 green candles" : ""
            }${config.dca.compound ? ", compounding" : ", fixed bet"}`,
          },
          {
            label: "DCA uptrend filter",
            value: config.dca.trendFilterEnabled
              ? `above the ${config.dca.trendMaBars}-candle average`
              : "off",
          },
          {
            label: "DCA confirmations",
            value:
              (config.dca.confirmations?.length ?? 0) > 0
                ? config.dca
                    .confirmations!.map(
                      (filter) =>
                        `${filter.indicator.type}${
                          filter.maxAgeBars ? ` (${filter.maxAgeBars} candles)` : ""
                        }`
                    )
                    .join(", ")
                : "none",
          },
          {
            label: "DCA base respect",
            value: config.dca.respectFilterEnabled
              ? `${config.dca.minRespectPct}% over ${config.dca.respectLookbackMonths} months`
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
 *
 * A side running one of the DCA rung take-profit modes has NO such bound: the
 * engine ignores `takeProfitPct` there and sells against the buy ladder instead,
 * so a rung sale can legitimately return far more than that percent. Counting it
 * would flag every honest rung-mode run as untrustworthy, so that side is
 * excluded — a null result just means the tripwire has nothing to check.
 */
export function automationTakeProfitPct(
  config: AutomationConfig
): number | null {
  const bounded = (side: "long" | "short") => {
    const levels = config.protection[side]
    if (!levels || levels.takeProfitPct === undefined) return undefined
    // A risk-reward target is measured against the stop each trade actually
    // got, so there is no one percent for the tripwire to check.
    if (levels.takeProfitRr !== undefined) return undefined
    const mode = levels.takeProfitMode
    return mode === undefined || mode === "average"
      ? levels.takeProfitPct
      : undefined
  }
  const values = [bounded("long"), bounded("short")].filter(
    (value): value is number => value !== undefined
  )
  return values.length > 0 ? Math.max(...values) : null
}
