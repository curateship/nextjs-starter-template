import * as React from "react"

import type { TradingDashboardWidgetLayout } from "@/lib/trade/dashboard/widgets"
import type { TradingRules } from "@/lib/trade/trading-rules"

export type TradeSettingsBootstrap = {
  tradingWidgets?: TradingDashboardWidgetLayout
  minimumMarketVolumeUsd?: number
  tradingRules?: TradingRules
}

export const TradeSettingsContext =
  React.createContext<TradeSettingsBootstrap | null>(null)

export function useTradeSettingsBootstrap() {
  return React.useContext(TradeSettingsContext)
}
