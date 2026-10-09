import * as React from "react"
import { Link } from "@tanstack/react-router"
import { TriangleAlertIcon } from "lucide-react"

import { loadSafetyPauses } from "@/lib/api/pomodoro/app-settings"
import { POMODORO_SETTINGS_TABS } from "@/lib/pomodoro/app-settings"

type Pauses = { newRooms: boolean; chat: boolean }

/**
 * Reads the two pause switches once (admin task 05). Null until known, and
 * on a failed read, which only costs the line below.
 */
export function useSafetyPauses() {
  const [pauses, setPauses] = React.useState<Pauses | null>(null)
  React.useEffect(() => {
    let live = true
    loadSafetyPauses()
      .then((value) => {
        if (live) setPauses(value)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return pauses
}

export function anyPaused(pauses: Pauses | null | undefined) {
  return Boolean(pauses && (pauses.newRooms || pauses.chat))
}

/**
 * Says a pause switch is on, so nobody forgets one after a spam wave. Shown
 * in every Pomoder admin table and on the settings page; the shell's own
 * admin pages have no slot for it.
 */
export function SafetyPauseLine({ pauses }: { pauses: Pauses }) {
  if (!anyPaused(pauses)) return null
  const what =
    pauses.newRooms && pauses.chat
      ? "New rooms and all chat are paused"
      : pauses.newRooms
        ? "New rooms are paused"
        : "All chat is paused"
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-destructive">
      <TriangleAlertIcon className="size-4 shrink-0" />
      <span>
        {what} for every member.{" "}
        <Link to="/admin/settings/$tab"
                          params={{ tab: POMODORO_SETTINGS_TABS.safety }} className="underline underline-offset-4">
          Switch it off in Settings
        </Link>
      </span>
    </p>
  )
}
