import * as React from "react"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import { PomodoroShell } from "@/components/pomodoro/pomodoro-shell"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadShellBootstrap } from "@/lib/api/shell"
import { setProductAuthenticated } from "@/lib/pomodoro/auth-state"
import { maybeImportGuestState } from "@/lib/pomodoro/guest-import"
import { reloadPomodoroData } from "@/lib/pomodoro/use-pomodoro"

/**
 * The product's layout route — the frontend, guests included. Everything
 * under it renders inside the app's own shell (sidebar, header, background
 * scene), the way the old app's `_pomoder` layout did; the Custom Shell's
 * admin chrome stays on the admin routes and never appears here.
 *
 * A guest gets the whole product out of browser storage. The first
 * signed-in visit after working as a guest imports that state to the
 * account, exactly once.
 */
export const Route = createFileRoute("/_pomodoro")({
  loader: async () => {
    const { user, ...shell } = await loadShellBootstrap()
    if (shell.settings?.maintenance.enabled && user?.role !== "admin") {
      throw redirect({ to: "/maintenance", replace: true })
    }
    return { user: user ?? null }
  },
  errorComponent: routeErrorComponent(
    () => "The app could not load. Reload to try again."
  ),
  component: PomodoroLayout,
})

function PomodoroLayout() {
  const { user } = Route.useLoaderData()
  const authenticated = Boolean(user)

  // The engines read this one fact instead of asking the server (which
  // would 401 for guests); the guest import runs after it is set so the
  // freshly imported tasks are what the reload fetches.
  React.useEffect(() => {
    setProductAuthenticated(authenticated)
    if (authenticated)
      void maybeImportGuestState().then((imported) => {
        if (imported) void reloadPomodoroData()
      })
  }, [authenticated])

  return (
    <PomodoroShell user={user}>
      <Outlet />
    </PomodoroShell>
  )
}
