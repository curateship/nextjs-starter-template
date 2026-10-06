import * as React from "react"

import { FrontPageRows } from "@/components/marketing/front-page-rows"
import type { LandingData } from "@/components/pomodoro/landing-page"
import { PomodoroShell } from "@/components/pomodoro/pomodoro-shell"
import { TimerDashboard } from "@/components/pomodoro/timer-dashboard"
import { loadPublicPageBlocks } from "@/lib/api/content/page-blocks"
import { loadAppFrontPageRows } from "@/lib/api/shell"
import { APP_FRONT_PAGE_ROW_KIND } from "@/lib/pages/front-page"
import { FRONT_PAGE_PATH } from "@/lib/pages/page-descriptor"
import { setProductAuthenticated } from "@/lib/pomodoro/auth-state"
import { maybeImportGuestState } from "@/lib/pomodoro/guest-import"
import { reloadPomodoroData } from "@/lib/pomodoro/use-pomodoro"

/**
 * The `/` page's body: the product shell around the timer dashboard, and under
 * it the live-figure rows an admin placed on the front page.
 */
export default function LandingTimer({ data }: { data: LandingData }) {
  const user = data.user
  const authenticated = Boolean(user)
  React.useEffect(() => {
    setProductAuthenticated(authenticated)
    if (authenticated)
      void maybeImportGuestState().then((imported) => {
        if (imported) void reloadPomodoroData()
      })
  }, [authenticated])

  return (
    <PomodoroShell user={user} accountMenu={data.accountMenu} bell={data.bell}>
      <TimerDashboard />
      {authenticated ? null : <LiveFigureRows />}
    </PomodoroShell>
  )
}

/**
 * The live-figure rows, for a visitor who is not signed in.
 *
 * Those rows are the one thing on this page aimed at somebody who is not a
 * member. `/` is the timer here rather than the shell's front page, so nothing
 * else would ever draw them.
 *
 * **Nothing here costs a visit a read it was not already paying.** The saved
 * rows come from the branding the root route has already loaded, and the figures
 * are asked for only when a row of this app's own is actually on the page — so
 * the front page of a deployment with no such rows reads nothing extra at all.
 * The figures themselves are held for a window inside the reader
 * (`src/server/pomodoro/front-page-rows.ts`), so a busy front page costs the
 * same as a quiet one.
 *
 * A member is not shown these. Somebody who already uses the app is told nothing
 * by being told other people use it.
 *
 * `FrontPageRows` is the shell's own row renderer, which is what gives each row
 * its heading, its alignment and its Visibility switches without repeating any
 * of that here. The billing arguments it takes are for a Plans row, and only
 * rows of this app's own kinds are passed, so none of them is read.
 */
function LiveFigureRows() {
  const [page, setPage] = React.useState<{
    rows: Awaited<ReturnType<typeof loadPublicPageBlocks>>
    data: Record<string, unknown>
  } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    // The blocks come from the table they live in rather than from the root
    // loader, which stopped carrying them when the front page became blocks
    // keyed by site and address. Hidden blocks never leave the server, so what
    // arrives here is what a visitor may see.
    void loadPublicPageBlocks(FRONT_PAGE_PATH)
      .then(async (savedRows) => {
        // Only this app's own kinds. A Text or Hero block placed in the page
        // editor is for the shell's front page, and `/` here is the timer.
        const appRows = savedRows.filter(
          (row) => row.kind === APP_FRONT_PAGE_ROW_KIND
        )
        if (appRows.length === 0) return { rows: appRows, data: {} }
        // The figures are read on the server from the saved blocks, never from
        // the list the browser is holding.
        const fills = await loadAppFrontPageRows()
        const dropped = new Set(fills.dropped)
        return {
          rows: appRows.filter((row) => !dropped.has(row.id)),
          data: fills.data,
        }
      })
      .then((result) => {
        if (!cancelled) setPage(result)
      })
      .catch(() => {
        // A front page is the most public thing this app has. A figure that
        // could not be read leaves its row off rather than showing an error to
        // somebody who has not even signed up.
        if (!cancelled) setPage({ rows: [], data: {} })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Nothing is drawn until the figures are in: a heading over an empty space is
  // worse than waiting, and a row under its floor never arrives at all.
  if (!page) return null
  const rows = page.rows
  if (rows.length === 0) return null

  return (
    <section className="flex w-full flex-col gap-2 py-8 md:gap-3">
      <FrontPageRows
        rows={rows}
        appRowData={page.data}
        plans={[]}
        trialUsed={false}
        interval="monthly"
        onIntervalChange={() => undefined}
        onSelectPlan={() => undefined}
      />
    </section>
  )
}
