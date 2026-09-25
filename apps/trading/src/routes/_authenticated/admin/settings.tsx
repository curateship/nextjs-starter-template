import { createFileRoute, useRouterState } from "@tanstack/react-router"

import {
  getSettingsTabFromPath,
  SettingsPage,
} from "@/components/settings-page"
import { useShellRuntime } from "@/components/shell-layout"

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsRoute,
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
      settingsError={runtime.settingsError}
      onConfigChange={runtime.onConfigChange}
      onSaveConfig={runtime.onSaveConfig}
    />
  )
}
