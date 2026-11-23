import * as React from "react"

import type { TradingEngineSettingsPage } from "@/lib/api/trade/trading-engine-settings"

export const TradingEngineSettingsContext =
  React.createContext<TradingEngineSettingsPage | null>(null)

export function useTradingEngineSettingsBootstrap() {
  return React.useContext(TradingEngineSettingsContext)
}
