import type {
  AutomationBacktestSettings,
} from "@/lib/automations/automation"
import type { AutomationDetail } from "@/lib/api/automations"
import type { StrategyInterval } from "@/lib/strategies/kinds/contract"

export type AutomationSettingsValues = {
  name: string
  interval: StrategyInterval
  takeProfitPct: string
  stopLossPct: string
  startingEquity: string
  takerFeeBps: string
  makerFeeBps: string
  slippageBps: string
}

export type AutomationProtectionValues = Pick<
  AutomationSettingsValues,
  "takeProfitPct" | "stopLossPct"
>

export type AutomationBacktestValues = Pick<
  AutomationSettingsValues,
  "startingEquity" | "takerFeeBps" | "makerFeeBps" | "slippageBps"
>

export function backtestSettingsToValues(
  settings: AutomationBacktestSettings
): AutomationBacktestValues {
  return {
    startingEquity: String(settings.startingEquity),
    takerFeeBps: String(settings.takerFeeBps),
    makerFeeBps: String(settings.makerFeeBps),
    slippageBps: String(settings.slippageBps),
  }
}

export function parseAutomationBacktestSettings(
  values: AutomationBacktestValues
):
  | { backtest: AutomationBacktestSettings; error: null }
  | { backtest: null; error: string } {
  const startingEquity = Number(values.startingEquity)
  if (
    !values.startingEquity.trim() ||
    !Number.isFinite(startingEquity) ||
    startingEquity <= 0 ||
    startingEquity > 100_000_000
  ) {
    return {
      backtest: null,
      error:
        "Starting capital must be greater than 0 and no more than 100,000,000 USD.",
    }
  }

  const fees = [
    { key: "takerFeeBps", label: "Taker fee", max: 50 },
    { key: "makerFeeBps", label: "Maker fee", max: 50 },
    { key: "slippageBps", label: "Slippage", max: 100 },
  ] as const
  const parsedFees = {} as Record<(typeof fees)[number]["key"], number>
  for (const fee of fees) {
    const raw = values[fee.key]
    const value = Number(raw)
    if (!raw.trim() || !Number.isFinite(value) || value < 0 || value > fee.max) {
      return {
        backtest: null,
        error: `${fee.label} must be between 0 and ${fee.max} bps.`,
      }
    }
    parsedFees[fee.key] = value
  }

  return { backtest: { startingEquity, ...parsedFees }, error: null }
}

export function parseAutomationProtection(
  values: AutomationProtectionValues
):
  | { protection: { takeProfitPct?: number; stopLossPct?: number }; error: null }
  | { protection: null; error: string } {
  const takeProfit = optionalPercent(
    values.takeProfitPct,
    "Take profit",
    1000
  )
  if (takeProfit.error) return { protection: null, error: takeProfit.error }
  const stopLoss = optionalPercent(values.stopLossPct, "Stop loss", 100)
  if (stopLoss.error) return { protection: null, error: stopLoss.error }

  return {
    protection: {
      ...(takeProfit.value === undefined
        ? {}
        : { takeProfitPct: takeProfit.value }),
      ...(stopLoss.value === undefined
        ? {}
        : { stopLossPct: stopLoss.value }),
    },
    error: null,
  }
}

export function buildAutomationSettingsSave(
  detail: AutomationDetail,
  values: AutomationSettingsValues
): {
  payload: Parameters<
    typeof import("@/lib/api/automations").saveAutomation
  >[0] | null
  error: string | null
} {
  const name = values.name.trim()
  if (!name || name.length > 80) {
    return {
      payload: null,
      error: "Name must be between 1 and 80 characters.",
    }
  }

  const parsedProtection = parseAutomationProtection(values)
  if (!parsedProtection.protection) {
    return { payload: null, error: parsedProtection.error }
  }

  const parsedBacktest = parseAutomationBacktestSettings(values)
  if (!parsedBacktest.backtest) {
    return { payload: null, error: parsedBacktest.error }
  }

  return {
    payload: {
      automationId: detail.id,
      name,
      interval: values.interval,
      graph: detail.graph,
      protection: parsedProtection.protection,
      backtest: parsedBacktest.backtest,
    },
    error: null,
  }
}

function optionalPercent(raw: string, label: string, max: number) {
  if (!raw.trim()) return { value: undefined, error: null }
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0 || value > max) {
    return {
      value: undefined,
      error: `${label} must be greater than 0% and no more than ${max}%.`,
    }
  }
  return { value, error: null }
}
