import * as React from "react"

import {
  TradeSettingsContext,
  type TradeSettingsBootstrap,
} from "@/components/trade/trade-settings-context"

export function TradeSettingsProvider({
  value,
  children,
}: {
  value: TradeSettingsBootstrap
  children: React.ReactNode
}) {
  return (
    <TradeSettingsContext.Provider value={value}>
      {children}
    </TradeSettingsContext.Provider>
  )
}
