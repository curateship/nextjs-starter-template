import { createFileRoute, redirect } from "@tanstack/react-router"

import { ShellLayout } from "@/components/shell-layout"
import { loadCurrentUser } from "@/lib/api/auth"
import { loadShellSettings } from "@/lib/api/shell-settings"
import { loadWorkspaces } from "@/lib/api/workspaces"

export const Route = createFileRoute("/_authenticated")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (!user) {
      throw redirect({ to: "/login" })
    }

    const { settings, settingsError } = await loadShellSettings()
    const workspaces = await loadWorkspaces()
    return { user, settings, settingsError, workspaces }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { user, settings, settingsError, workspaces } = Route.useLoaderData()
  return (
    <ShellLayout
      user={user}
      settings={settings}
      settingsError={settingsError}
      workspaces={workspaces}
    />
  )
}
