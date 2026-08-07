import { createFileRoute, useRouterState } from "@tanstack/react-router"

import {
  getSettingsTabFromPath,
  SettingsPage,
} from "@/components/settings/settings-page"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getShellSettingsErrorMessage } from "@/lib/api/shell-settings"

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsRoute,
  errorComponent: routeErrorComponent(getShellSettingsErrorMessage),
})

function SettingsRoute() {
  const runtime = useShellRuntime()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <SettingsPage
      activeTab={getSettingsTabFromPath(pathname)}
      config={runtime.config}
      onConfigChange={runtime.onConfigChange}
      onSaveConfig={runtime.onSaveConfig}
      onMaintenanceChange={runtime.onMaintenanceChange}
      maintenanceBusy={runtime.maintenanceBusy}
      onSessionPolicyChange={runtime.onSessionPolicyChange}
      sessionPolicyBusy={runtime.sessionPolicyBusy}
    />
  )
}
