import * as React from "react"

import { useTeamId } from "@/lib/project/team-scope"

/**
 * Hears about changes for My dashboard and the Team dashboard as they happen
 * (`src/routes/api/project/my-live.ts`): "mine" when a project I'm on
 * changed, "team" for the team's own things and the other projects I can
 * see, and "all" when changes may have been missed. The page then loads
 * itself again.
 *
 * One connection per tab, shared by everything on the page. It closes while
 * the tab is hidden and says "all" on coming back, like `use-project-live.ts`.
 * The site admin's connection names the team the page shows, and moves when
 * the tab moves to another team's page.
 */
export type MyLiveChange = "mine" | "team" | "all"

const listeners = new Set<(change: MyLiveChange) => void>()
let source: EventSource | null = null
let sourceTeam: string | undefined
let watchingVisibility = false

function tell(change: MyLiveChange) {
  for (const listener of listeners) listener(change)
}

function open() {
  if (source || document.hidden) return
  const next = new EventSource(
    sourceTeam ? `/api/project/my-live?team=${encodeURIComponent(sourceTeam)}` : "/api/project/my-live"
  )
  next.onmessage = (event: MessageEvent<string>) => tell(event.data as MyLiveChange)
  // The browser reconnects by itself after a dropped connection, and what
  // changed in the gap was told to nobody, so every reopen after the first says "all".
  let opened = false
  next.onopen = () => {
    if (opened) tell("all")
    opened = true
  }
  source = next
}

function close() {
  source?.close()
  source = null
}

function onVisibility() {
  if (document.hidden) {
    close()
  } else if (listeners.size && !source) {
    open()
    tell("all")
  }
}

function subscribe(listener: (change: MyLiveChange) => void, teamId: string | undefined) {
  if (!watchingVisibility) {
    document.addEventListener("visibilitychange", onVisibility)
    watchingVisibility = true
  }
  if (teamId !== sourceTeam) {
    close()
    sourceTeam = teamId
  }
  listeners.add(listener)
  open()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) close()
  }
}

/** A burst of changes, such as a whole check-in saved at once, becomes one reload. */
const SETTLE_MS = 500

/**
 * Calls `onChange` shortly after a change it cares about. `wants` picks the
 * changes; every "all" is wanted.
 */
export function useMyLive(wants: (change: MyLiveChange) => boolean, onChange: () => void) {
  const teamId = useTeamId()
  const latest = React.useRef({ wants, onChange })
  React.useEffect(() => {
    latest.current = { wants, onChange }
  })

  React.useEffect(() => {
    let timer: number | undefined
    const unsubscribe = subscribe((change) => {
      if (change !== "all" && !latest.current.wants(change)) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => latest.current.onChange(), SETTLE_MS)
    }, teamId)
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [teamId])
}
