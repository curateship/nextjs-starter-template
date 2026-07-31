import { createFileRoute, redirect } from "@tanstack/react-router"

import { ShellLayout } from "@/components/shell/shell-layout"
import { isAccountTab } from "@/components/account/account-dialog"
import { loadShellBootstrap } from "@/lib/api/shell"

// The shell's data changes rarely and every mutation that touches it calls
// router.invalidate(), so hold it briefly instead of refetching on every click.
const SHELL_STALE_TIME_MS = 60_000

export const Route = createFileRoute("/_authenticated")({
  staleTime: SHELL_STALE_TIME_MS,
  // `?account=<tab>` drives the account modal, so it is valid on every
  // authenticated page. Anything else is dropped.
  validateSearch: (search: Record<string, unknown>) => {
    return isAccountTab(search.account) ? { account: search.account } : {}
  },
  loader: async ({ location }) => {
    const { user, ...shell } = await loadShellBootstrap()
    if (!user) {
      // Remember where they were headed so login can send them back.
      throw redirect({ to: "/login", search: { redirect: location.href } })
    }

    // Maintenance mode shuts the door on everyone but admins. The flag arrives
    // from the server with the rest of the shell, so it holds on a fresh load,
    // on a navigation once this data is stale, and straight after signing in —
    // there is no client state a member could keep working from.
    if (shell.settings?.maintenance.enabled && user.role !== "admin") {
      throw redirect({ to: "/maintenance" })
    }

    return { user, ...shell }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { user, settings, workspaces, plan, unreadNotifications, announcements } =
    Route.useLoaderData()
  return (
    <ShellLayout
      user={user}
      settings={settings}
      workspaces={workspaces}
      plan={plan}
      unreadNotifications={unreadNotifications}
      announcements={announcements}
    />
  )
}
