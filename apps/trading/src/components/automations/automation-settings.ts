import type { AutomationDetail } from "@/lib/api/automations"
import type { StrategyInterval } from "@/lib/strategies/kinds/contract"

export type AutomationSettingsValues = {
  name: string
  interval: StrategyInterval
  takeProfitPct: string
  stopLossPct: string
}

export type AutomationProtectionValues = Pick<
  AutomationSettingsValues,
  "takeProfitPct" | "stopLossPct"
>

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

  return {
    payload: {
      automationId: detail.id,
      name,
      interval: values.interval,
      graph: detail.graph,
      protection: parsedProtection.protection,
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
