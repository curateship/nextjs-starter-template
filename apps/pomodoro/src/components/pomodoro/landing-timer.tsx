import * as React from "react"
import { useLoaderData } from "@tanstack/react-router"

import { FrontPageRows } from "@/components/marketing/front-page-rows"
import { PomodoroShell } from "@/components/pomodoro/pomodoro-shell"
import { TimerDashboard } from "@/components/pomodoro/timer-dashboard"
import { loadAppFrontPageRows } from "@/lib/api/shell"
import { APP_FRONT_PAGE_ROW_KIND } from "@/lib/pages/front-page"
import { setProductAuthenticated } from "@/lib/pomodoro/auth-state"
import { maybeImportGuestState } from "@/lib/pomodoro/guest-import"
import { reloadPomodoroData } from "@/lib/pomodoro/use-pomodoro"

/**
 * The `/` page's body: the product shell around the timer dashboard, and under
 * it the live-figure rows an admin placed on the front page.
 */
export default function LandingTimer({
  data,
}: {
  data: { user: { name: string; role: string } | null }
}) {
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
    <PomodoroShell user={user}>
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
  const branding = useLoaderData({ from: "__root__" })
  const [fills, setFills] = React.useState<{
    data: Record<string, unknown>
    dropped: string[]
  } | null>(null)

  // Only this app's own kinds. A Text or Hero row placed in the builder is for
  // the shell's front page, and `/` here is the timer, not that page.
  const appRows = React.useMemo(
    () =>
      (branding?.frontPageRows ?? []).filter(
        (row) => row.kind === APP_FRONT_PAGE_ROW_KIND
      ),
    [branding?.frontPageRows]
  )

  const hasRows = appRows.length > 0
  React.useEffect(() => {
    if (!hasRows) return
    let cancelled = false
    // The figures are read on the server from the saved rows, never from the
    // list the browser is holding.
    void loadAppFrontPageRows()
      .then((result) => {
        if (!cancelled) setFills(result)
      })
      .catch(() => {
        // A front page is the most public thing this app has. A figure that
        // could not be read leaves its row off rather than showing an error to
        // somebody who has not even signed up.
        if (!cancelled)
          setFills({ data: {}, dropped: appRows.map((row) => row.id) })
      })
    return () => {
      cancelled = true
    }
  }, [hasRows, appRows])

  // Nothing is drawn until the figures are in: a heading over an empty space is
  // worse than waiting, and a row under its floor never arrives at all.
  if (!fills) return null
  const dropped = new Set(fills.dropped)
  const rows = appRows.filter((row) => !dropped.has(row.id))
  if (rows.length === 0) return null

  return (
    <section className="flex w-full flex-col gap-2 py-8 md:gap-3">
      <FrontPageRows
        rows={rows}
        appRowData={fills.data}
        plans={[]}
        trialUsed={false}
        interval="monthly"
        onIntervalChange={() => undefined}
        onSelectPlan={() => undefined}
      />
    </section>
  )
}
