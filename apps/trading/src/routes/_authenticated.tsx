import { createFileRoute, redirect } from "@tanstack/react-router"

import { ShellLayout } from "@/components/shell-layout"
import { loadAuthenticatedShell } from "@/lib/api/authenticated-shell"
import { configuredRouteTarget } from "@/lib/api/shell-settings"

export const Route = createFileRoute("/_authenticated")({
  loader: async ({ location }) => {
    const shell = await loadAuthenticatedShell()
    if (!shell) throw redirect({ to: "/login" })
    if (location.pathname === "/") {
      const target = configuredRouteTarget(shell.settings.adminRoute)
      if (target) throw redirect({ href: target })
    }
    return shell
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { user, settings, workspaces } = Route.useLoaderData()
  return <ShellLayout user={user} settings={settings} workspaces={workspaces} />
}
