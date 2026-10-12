import * as React from "react"

import { loadRoom, type PersonRoom } from "@/lib/api/project/team-running"

/**
 * Each teammate's open tasks and time off, for a hand-to picker, read each
 * time `active` turns on (a window opening), so the counts are fresh. Until
 * it arrives the picker shows names alone, and a failed read leaves them that
 * way: the picker still works without it.
 */
export function usePeopleRoom(active = true): Record<string, PersonRoom> {
  const [room, setRoom] = React.useState<Record<string, PersonRoom>>({})
  React.useEffect(() => {
    if (!active) return
    let live = true
    loadRoom().then(
      (next) => live && setRoom(next),
      () => undefined
    )
    return () => {
      live = false
    }
  }, [active])
  return room
}
