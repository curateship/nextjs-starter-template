import * as React from "react"

import { TradingEngineSettingsContext } from "@/components/workers/trading-engine-settings-context"
import type { TradingEngineSettingsPage } from "@/lib/api/trade/trading-engine-settings"

export function TradingEngineSettingsProvider({
  value,
  children,
}: {
  value: TradingEngineSettingsPage
  children: React.ReactNode
}) {
  return (
    <TradingEngineSettingsContext.Provider value={value}>
      {children}
    </TradingEngineSettingsContext.Provider>
  )
}
