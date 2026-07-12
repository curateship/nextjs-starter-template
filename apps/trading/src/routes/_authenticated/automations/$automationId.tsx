import { createFileRoute } from "@tanstack/react-router"

import {
  AutomationRouteContent,
  AutomationRouteError,
} from "@/components/automations/automation-route-content"
import { getAutomation } from "@/lib/api/automations"
import { loadIndicators } from "@/lib/api/indicators"
import { loadStrategyLibrary } from "@/lib/api/strategies"
import { loadTradingContext } from "@/lib/api/trading"
import { priceActionParamsFromChart } from "@/lib/indicators/defs/price-action"
import { SIGNAL_FOR_CHART_TYPE } from "@/lib/indicators/registry"

export const Route = createFileRoute(
  "/_authenticated/automations/$automationId"
)({
  loader: async ({ params }) => {
    const [automation, trading, library, chartIndicators] = await Promise.all([
      getAutomation(params.automationId),
      loadTradingContext(),
      loadStrategyLibrary(),
      loadIndicators(),
    ])
    // Pins from either home count: the Strategies page pins signal modules
    // directly; a pinned chart indicator offers its signal counterpart.
    const pinnedIndicators = [
      ...new Set([
        ...library.strategies
          .filter((strategy) => strategy.pinned)
          .map((strategy) => strategy.type),
        ...chartIndicators
          .filter((indicator) => indicator.pinned)
          .flatMap((indicator) => {
            const type = SIGNAL_FOR_CHART_TYPE[indicator.type]
            return type ? [type] : []
          }),
      ]),
    ]
    // New Price Action nodes start as an exact copy of the chart's settings.
    const chartPriceAction = chartIndicators.find(
      (indicator) => indicator.type === "priceAction"
    )
    const indicatorParamSeeds = chartPriceAction
      ? { price_action: priceActionParamsFromChart(chartPriceAction.params) }
      : {}
    return { automation, trading, pinnedIndicators, indicatorParamSeeds }
  },
  errorComponent: AutomationRouteError,
  component: AutomationRouteContent,
})
