import { createFileRoute, redirect } from "@tanstack/react-router"

import { ShellLayout } from "@/components/shell-layout"
import { loadCurrentUser } from "@/lib/auth-api"
import { loadShellSettings } from "@/lib/shell-settings-api"

export const Route = createFileRoute("/_authenticated")({
  shouldReload: false,
  loader: async () => {
    const user = await loadCurrentUser()
    if (!user) {
      throw redirect({ to: "/login" })
    }

    const { settings } = await loadShellSettings()
    return { user, settings }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { user, settings } = Route.useLoaderData()
  return <ShellLayout user={user} settings={settings} />
}
