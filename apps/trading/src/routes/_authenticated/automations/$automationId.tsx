import { createFileRoute } from "@tanstack/react-router"

import {
  AutomationRouteContent,
  AutomationRouteError,
} from "@/components/automations/automation-route-content"
import { getAutomation } from "@/lib/api/automations"
import { loadIndicators } from "@/lib/api/indicators"
import { emaCrossParamsFromChart } from "@/lib/indicators/defs/ema-cross"
import { priceActionParamsFromChart } from "@/lib/indicators/defs/price-action"
import { trendlineParamsFromChart } from "@/lib/indicators/defs/trendline"
import { SIGNAL_FOR_CHART_TYPE } from "@/lib/indicators/registry"
import {
  fairValueGapChartToModuleParams,
  qqeChartToModuleParams,
} from "@/lib/trading/indicators-config"

export const Route = createFileRoute(
  "/_authenticated/automations/$automationId"
)({
  loader: async ({ params }) => {
    const [automation, chartIndicators] = await Promise.all([
      getAutomation(params.automationId),
      loadIndicators(),
    ])
    // A pinned chart indicator offers its signal counterpart in the palette.
    const pinnedIndicators = [
      ...new Set(
        chartIndicators
          .filter((indicator) => indicator.pinned)
          .flatMap((indicator) => {
            const type = SIGNAL_FOR_CHART_TYPE[indicator.type]
            return type ? [type] : []
          })
      ),
    ]
    // New indicator nodes start as an exact copy of the chart's settings.
    const chartPriceAction = chartIndicators.find(
      (indicator) => indicator.type === "priceAction"
    )
    const chartEma = chartIndicators.find(
      (indicator) => indicator.type === "ema"
    )
    const chartQqe = chartIndicators.find(
      (indicator) => indicator.type === "qqe"
    )
    const chartFvg = chartIndicators.find(
      (indicator) => indicator.type === "fairValueGap"
    )
    const chartTrendline = chartIndicators.find(
      (indicator) => indicator.type === "trendline"
    )
    const indicatorParamSeeds = {
      ...(chartPriceAction
        ? { price_action: priceActionParamsFromChart(chartPriceAction.params) }
        : {}),
      ...(chartEma
        ? { ema_cross: emaCrossParamsFromChart(chartEma.params) }
        : {}),
      ...(chartQqe ? { qqe: qqeChartToModuleParams(chartQqe.params) } : {}),
      ...(chartFvg
        ? { fair_value_gap: fairValueGapChartToModuleParams(chartFvg.params) }
        : {}),
      ...(chartTrendline
        ? { trendline: trendlineParamsFromChart(chartTrendline.params) }
        : {}),
    }
    return { automation, pinnedIndicators, indicatorParamSeeds }
  },
  errorComponent: AutomationRouteError,
  component: AutomationRouteContent,
})
