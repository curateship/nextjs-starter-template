import * as React from "react"

import type { TradingDashboardWidgetLayout } from "@/lib/trade/dashboard/widgets"

export type TradeSettingsBootstrap = {
  tradingWidgets?: TradingDashboardWidgetLayout
  minimumMarketVolumeUsd?: number
}

export const TradeSettingsContext =
  React.createContext<TradeSettingsBootstrap | null>(null)

export function useTradeSettingsBootstrap() {
  return React.useContext(TradeSettingsContext)
}
