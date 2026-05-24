/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, redirect, useRouterState } from "@tanstack/react-router"

import {
  getSettingsTabFromPath,
  SettingsPage,
} from "@/components/settings-page"
import { useShellRuntime } from "@/components/shell-layout"
import { loadCurrentUser } from "@/lib/api/auth"

export const Route = createFileRoute("/_authenticated/admin/settings")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user?.role !== "admin") throw redirect({ to: "/" })
  },
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
      saveStatus={runtime.saveStatus}
      onConfigChange={runtime.onConfigChange}
      onSaveConfig={runtime.onSaveConfig}
    />
  )
}
