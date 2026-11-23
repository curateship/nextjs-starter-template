import { getRouteApi } from "@tanstack/react-router"

import { useTradePageTitle } from "@/app/page-title"
import {
  getSettingsTabFromPath,
  SettingsPage,
} from "@/components/settings/settings-page"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { TradingEngineSettingsProvider } from "@/components/workers/trading-engine-settings-bootstrap"

const route = getRouteApi("/_authenticated/admin/settings_/trading-engine")

export function TradingEngineSettingsPage() {
  useTradePageTitle("Settings")
  const runtime = useShellRuntime()
  const bootstrap = route.useLoaderData()

  return (
    <TradingEngineSettingsProvider value={bootstrap}>
      <SettingsPage
        activeTab={getSettingsTabFromPath("/admin/settings/trading-engine")}
        config={runtime.config}
        onConfigChange={runtime.onConfigChange}
        onSaveConfig={runtime.onSaveConfig}
        onMaintenanceChange={runtime.onMaintenanceChange}
        maintenanceBusy={runtime.maintenanceBusy}
        onSessionPolicyChange={runtime.onSessionPolicyChange}
        sessionPolicyBusy={runtime.sessionPolicyBusy}
      />
    </TradingEngineSettingsProvider>
  )
}
