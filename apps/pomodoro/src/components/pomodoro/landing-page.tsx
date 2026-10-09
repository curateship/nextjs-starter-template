import * as React from "react"

// The Pomoder stylesheet, loaded with every page rather than with the frame.
// The front page and the sign-in pages draw the product shell from a chunk
// loaded on demand (see below), and a stylesheet that arrives with such a
// chunk arrives late: measured in dev, the server's copy of the styles was
// removed about 200ms before the chunk's own landed, so "/" showed the shell's
// plain look in between. Imported here, it is part of the app's first load.
// A stylesheet carries no code, so it cannot reopen the import circle the
// lazy import exists for. Every rule in it is scoped to
// `[data-pomodoro-screen]`, so on the admin screens it is 11KB that matches
// nothing. The fonts stay with the shell: those download when loaded.
import "@/components/pomodoro/theme.css"

import type { AccountMenuUser } from "@/components/pomodoro/account-menu"
import type { HeaderBell } from "@/components/pomodoro/pomodoro-shell"
import { definePublicPage } from "@/lib/app-options"
import type { AccountMenuFacts } from "@/lib/api/pomodoro/profile"
import type { MediaBootstrap } from "@/lib/pomodoro/media-pair"

/**
 * The front page is the timer itself, exactly like the old app: a visitor
 * lands in a working focus session with no account (the guest engine), and
 * a signed-in person lands on their own dashboard at the same address.
 * Wired through the shell's landing.page option in src/app/options.ts.
 *
 * Everything heavy hides behind dynamic imports on purpose. This module is
 * imported by src/app/options.ts, which sits inside the app-options import
 * circle — a top-level import of any `@/lib/api/*` module from here would
 * build server functions while modules are still loading and break at boot
 * (and it did, in the page tests, before this shape).
 */

export type LandingData = {
  user: AccountMenuUser | null
  accountMenu: AccountMenuFacts | null
  /** The pair of the room you are in; a guest's is random on every visit. */
  media: MediaBootstrap | null
  bell: HeaderBell
}

const LandingTimer = React.lazy(
  () => import("@/components/pomodoro/landing-timer")
)

export const pomodoroLandingPage = definePublicPage<LandingData>({
  loader: async () => {
    const { loadShellBootstrap } = await import("@/lib/api/shell")
    const { user, unseenNotifications, settings } = await loadShellBootstrap()
    const bell = {
      unseen: unseenNotifications,
      live: settings?.liveNotifications ?? true,
    }
    // Tyler, 7 Oct 2026: a guest's front page gets a random sound and theme.
    // Picked by the server, in the loader, so the server draws the same pair
    // the browser then holds, and nothing swaps on the first frame.
    if (!user) {
      const { loadGuestMediaBootstrap } = await import(
        "@/lib/api/pomodoro/personal-room"
      )
      const media = await loadGuestMediaBootstrap().catch(() => null)
      return { user: null, accountMenu: null, media, bell }
    }
    // The same facts, and the same rule on failure, as the `_pomodoro` layout.
    const [{ loadAccountMenu }, { loadRoomMediaBootstrap }] = await Promise.all([
      import("@/lib/api/pomodoro/profile"),
      import("@/lib/api/pomodoro/personal-room"),
    ])
    const [accountMenu, media] = await Promise.all([
      loadAccountMenu().catch(() => null),
      loadRoomMediaBootstrap().catch(() => null),
    ])
    return { user, accountMenu, media, bell }
  },
  head: () => {
    const meta: Array<Record<string, string>> = [
      { title: "Pomoder — a focus timer you can use right now" },
      {
        name: "description",
        content:
          "A pomodoro timer with tasks, ambient sound and focus history. No account needed to start.",
      },
    ]
    return { meta }
  },
  Component: ({ data }) => (
    <React.Suspense fallback={null}>
      <LandingTimer data={data} />
    </React.Suspense>
  ),
})
