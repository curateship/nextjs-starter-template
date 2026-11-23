import * as React from "react"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import { PomodoroShell } from "@/components/pomodoro/pomodoro-shell"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  loadGuestMediaBootstrap,
  loadRoomMediaBootstrap,
} from "@/lib/api/pomodoro/personal-room"
import { loadAccountMenu } from "@/lib/api/pomodoro/profile"
import { loadShellBootstrap } from "@/lib/api/shell"
import { ProductAuthContext, setProductAccount } from "@/lib/pomodoro/auth-state"
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
    // The account menu's plan line and profile row. A failure leaves both
    // off rather than failing the page: guessing "Free" would tell a paying
    // member the wrong thing.
    // The sound and theme of the room you are in are read here too, so the
    // first frame draws them rather than the default scene. A failure draws
    // the default. A guest gets a random free pair, picked by the server so
    // the server and the browser draw the same one. Both answers carry the
    // Live themes and sounds, which every page below lists from.
    const [accountMenu, media] = user
      ? await Promise.all([
          loadAccountMenu().catch(() => null),
          loadRoomMediaBootstrap().catch(() => null),
        ])
      : [null, await loadGuestMediaBootstrap().catch(() => null)]
    return {
      user: user ?? null,
      accountMenu,
      media,
      bell: {
        unseen: shell.unseenNotifications,
        live: shell.settings?.liveNotifications ?? true,
      },
    }
  },
  errorComponent: routeErrorComponent(
    () => "The app could not load. Reload to try again."
  ),
  component: PomodoroLayout,
})

function PomodoroLayout() {
  const { user, accountMenu, media, bell } = Route.useLoaderData()

  // The engines read this one fact instead of asking the server (which
  // would 401 for guests); the guest import runs after it is set so the
  // freshly imported tasks are what the reload fetches.
  const accountEmail = user?.email ?? null
  React.useEffect(() => {
    setProductAccount(accountEmail)
    if (accountEmail)
      void maybeImportGuestState().then((imported) => {
        if (imported) void reloadPomodoroData()
      })
  }, [accountEmail])

  // The same answer for the server's render and the browser's first one, so
  // a signed-in page never draws signed out first.
  const auth = React.useMemo(
    () => ({ known: true, authenticated: accountEmail !== null }),
    [accountEmail]
  )

  return (
    <ProductAuthContext.Provider value={auth}>
      <PomodoroShell
        user={user}
        accountMenu={accountMenu}
        media={media}
        bell={bell}
      >
        <Outlet />
      </PomodoroShell>
    </ProductAuthContext.Provider>
  )
}
