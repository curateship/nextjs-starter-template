import { createFileRoute } from "@tanstack/react-router"

import {
  getSettingsTabFromPath,
  SettingsPage,
} from "@/components/settings-page"
import { useShellRuntime } from "@/components/shell-layout"

export const Route = createFileRoute("/_authenticated/admin/settings/$tab")({
  component: SettingsTabRoute,
})

function SettingsTabRoute() {
  const runtime = useShellRuntime()
  const { tab } = Route.useParams()
  const activeTab = getSettingsTabFromPath(`/admin/settings/${tab}`)

  return (
    <SettingsPage
      activeTab={activeTab}
      config={runtime.config}
      settingsError={runtime.settingsError}
      onConfigChange={runtime.onConfigChange}
      onSaveConfig={runtime.onSaveConfig}
    />
  )
}
