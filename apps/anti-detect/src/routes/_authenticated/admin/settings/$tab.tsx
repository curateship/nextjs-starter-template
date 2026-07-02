import { createFileRoute } from "@tanstack/react-router"

import {
  getSettingsTabFromPath,
  SettingsPage,
} from "@/components/settings-page"
import { useShellRuntime } from "@/components/shell-layout"
import { requireAdminRoute } from "@/lib/admin-route"

export const Route = createFileRoute("/_authenticated/admin/settings/$tab")({
  loader: requireAdminRoute,
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
      saveStatus={runtime.saveStatus}
      onConfigChange={runtime.onConfigChange}
      onSaveConfig={runtime.onSaveConfig}
    />
  )
}
