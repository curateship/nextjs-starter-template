import { createFileRoute, redirect } from "@tanstack/react-router"

import {
  getSettingsTabFromPath,
  SettingsPage,
} from "@/components/settings/settings-page"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getShellSettingsErrorMessage } from "@/lib/api/shell-settings"
import { movedSettingsTab } from "@/lib/admin-dashboard/moved-settings"
import { appSettingsTabs } from "@/lib/app-options"

export const Route = createFileRoute("/_authenticated/admin/settings/$tab")({
  // Navigation and Styling moved into the Admin dashboard on 9 Nov 2026; their
  // old addresses land there, unless the app drew its own screen in the row.
  beforeLoad: ({ params }) => {
    const moved = movedSettingsTab(params.tab)
    if (!moved || appSettingsTabs().some((tab) => tab.id === params.tab)) return
    throw redirect({ to: "/admin/dashboard", search: moved, replace: true })
  },
  component: SettingsTabRoute,
  errorComponent: routeErrorComponent(getShellSettingsErrorMessage),
})

function SettingsTabRoute() {
  const runtime = useShellRuntime()
  const { tab } = Route.useParams()
  const activeTab = getSettingsTabFromPath(`/admin/settings/${tab}`)

  return (
    <SettingsPage
      activeTab={activeTab}
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
