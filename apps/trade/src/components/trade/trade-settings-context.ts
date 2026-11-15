import * as React from "react"

import type { Goal } from "@/lib/trade/goal"
import type { TradingRules } from "@/lib/trade/trading-rules"

export type TradeSettingsBootstrap = {
  minimumMarketVolumeUsd?: number
  tradingRules?: TradingRules
  goal?: Goal
}

export const TradeSettingsContext =
  React.createContext<TradeSettingsBootstrap | null>(null)

export function useTradeSettingsBootstrap() {
  return React.useContext(TradeSettingsContext)
}
