import * as React from "react"

import { PomodoroShell } from "@/components/pomodoro/pomodoro-shell"
import { TimerDashboard } from "@/components/pomodoro/timer-dashboard"
import { setProductAuthenticated } from "@/lib/pomodoro/auth-state"
import { maybeImportGuestState } from "@/lib/pomodoro/guest-import"
import { reloadPomodoroData } from "@/lib/pomodoro/use-pomodoro"

/** The `/` page's body: the product shell around the timer dashboard. */
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
    </PomodoroShell>
  )
}
