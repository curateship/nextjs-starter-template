import { getRouteApi } from "@tanstack/react-router"

import { useTradePageTitle } from "@/app/page-title"
import {
  getSettingsTabFromPath,
  SettingsPage,
} from "@/components/settings/settings-page"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { TradeSettingsProvider } from "@/components/trade/trade-settings-bootstrap"
import type { TradeSettingsBootstrap } from "@/components/trade/trade-settings-context"

const widgetsRoute = getRouteApi(
  "/_authenticated/admin/settings_/trading-widgets"
)
const marketsRoute = getRouteApi("/_authenticated/admin/settings_/markets")
const tradingRulesRoute = getRouteApi(
  "/_authenticated/admin/settings_/trading-rules"
)

export function TradingWidgetsSettingsPage() {
  const { layout } = widgetsRoute.useLoaderData()
  return (
    <TradeSettingsPage
      tab="trading-widgets"
      bootstrap={{ tradingWidgets: layout }}
    />
  )
}

export function MarketsSettingsPage() {
  const { minimumVolumeUsd } = marketsRoute.useLoaderData()
  return (
    <TradeSettingsPage
      tab="markets"
      bootstrap={{ minimumMarketVolumeUsd: minimumVolumeUsd }}
    />
  )
}

export function TradingRulesSettingsPage() {
  const { rules } = tradingRulesRoute.useLoaderData()
  return (
    <TradeSettingsPage
      tab="trading-rules"
      bootstrap={{ tradingRules: rules }}
    />
  )
}

function TradeSettingsPage({
  tab,
  bootstrap,
}: {
  tab: "trading-widgets" | "markets" | "trading-rules"
  bootstrap: TradeSettingsBootstrap
}) {
  useTradePageTitle("Settings")
  const runtime = useShellRuntime()

  return (
    <TradeSettingsProvider value={bootstrap}>
      <SettingsPage
        activeTab={getSettingsTabFromPath(`/admin/settings/${tab}`)}
        config={runtime.config}
        onConfigChange={runtime.onConfigChange}
        onSaveConfig={runtime.onSaveConfig}
        onMaintenanceChange={runtime.onMaintenanceChange}
        maintenanceBusy={runtime.maintenanceBusy}
        onSessionPolicyChange={runtime.onSessionPolicyChange}
        sessionPolicyBusy={runtime.sessionPolicyBusy}
      />
    </TradeSettingsProvider>
  )
}
