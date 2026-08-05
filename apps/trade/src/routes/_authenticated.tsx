import { createFileRoute, redirect } from "@tanstack/react-router"

import { ShellLayout } from "@/components/shell-layout"
import { loadShellBootstrap } from "@/lib/api/shell"

// The shell's data changes rarely and every mutation that touches it calls
// router.invalidate(), so hold it briefly instead of refetching on every click.
const SHELL_STALE_TIME_MS = 60_000

export const Route = createFileRoute("/_authenticated")({
  staleTime: SHELL_STALE_TIME_MS,
  loader: async () => {
    const { user, ...shell } = await loadShellBootstrap()
    if (!user) {
      throw redirect({ to: "/login" })
    }

    return { user, ...shell }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { user, settings, workspaces, plan } = Route.useLoaderData()
  return (
    <ShellLayout
      user={user}
      settings={settings}
      workspaces={workspaces}
      plan={plan}
    />
  )
}
