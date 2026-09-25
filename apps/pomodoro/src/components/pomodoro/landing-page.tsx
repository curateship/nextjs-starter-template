import * as React from "react"

import { definePublicPage } from "@/lib/app-options"

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

type LandingData = { user: { name: string; role: string } | null }

const LandingTimer = React.lazy(
  () => import("@/components/pomodoro/landing-timer")
)

export const pomodoroLandingPage = definePublicPage<LandingData>({
  loader: async () => {
    const { loadShellBootstrap } = await import("@/lib/api/shell")
    const { user } = await loadShellBootstrap()
    return { user: user ?? null }
  },
  head: () => {
    const meta: Array<Record<string, string>> = [
      { title: "Pomodoro — a focus timer you can use right now" },
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
