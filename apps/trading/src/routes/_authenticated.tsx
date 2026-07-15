import { createFileRoute, redirect } from "@tanstack/react-router"

import { ShellLayout } from "@/components/shell-layout"
import { loadAuthenticatedShell } from "@/lib/api/authenticated-shell"

export const Route = createFileRoute("/_authenticated")({
  loader: async () => {
    const shell = await loadAuthenticatedShell()
    if (!shell) throw redirect({ to: "/login" })
    return shell
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { user, settings, workspaces } = Route.useLoaderData()
  return <ShellLayout user={user} settings={settings} workspaces={workspaces} />
}
