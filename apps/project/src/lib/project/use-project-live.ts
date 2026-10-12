import * as React from "react"

/**
 * Hears about changes in one project as they happen
 * (`src/routes/api/project/live.$projectId.ts`): "task:<id>" when a task or
 * anything on it changed, "chat" for the project's own chat, and "all" when
 * changes may have been missed. The page then loads what changed itself.
 *
 * Everything on a page watching the same project shares one connection. It
 * closes while the tab is hidden, so a pile of background tabs holds none,
 * and coming back says "all" so the page catches up on what it missed.
 */
export type LiveChange = `task:${string}` | "chat" | "all"

type Channel = { source: EventSource | null; listeners: Set<(change: LiveChange) => void> }

const channels = new Map<string, Channel>()
let watchingVisibility = false

function open(projectId: string, channel: Channel) {
  if (channel.source || document.hidden) return
  const source = new EventSource(`/api/project/live/${encodeURIComponent(projectId)}`)
  const tell = (change: LiveChange) => {
    for (const listener of channel.listeners) listener(change)
  }
  source.onmessage = (event: MessageEvent<string>) => tell(event.data as LiveChange)
  // The browser reconnects by itself after a dropped connection (a server
  // restart, a network blip), and whatever changed in the gap was told to
  // nobody, so every reconnect after the first open says "all".
  let opened = false
  source.onopen = () => {
    if (opened) tell("all")
    opened = true
  }
  channel.source = source
}

function close(channel: Channel) {
  channel.source?.close()
  channel.source = null
}

function onVisibility() {
  for (const [projectId, channel] of channels) {
    if (document.hidden) {
      close(channel)
    } else if (!channel.source) {
      open(projectId, channel)
      for (const listener of channel.listeners) listener("all")
    }
  }
}

function subscribe(projectId: string, listener: (change: LiveChange) => void) {
  if (!watchingVisibility) {
    document.addEventListener("visibilitychange", onVisibility)
    watchingVisibility = true
  }
  let channel = channels.get(projectId)
  if (!channel) {
    channel = { source: null, listeners: new Set() }
    channels.set(projectId, channel)
  }
  channel.listeners.add(listener)
  open(projectId, channel)
  return () => {
    const current = channels.get(projectId)
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      close(current)
      channels.delete(projectId)
    }
  }
}

/** A burst of changes, such as 30 tasks moved at once, becomes one call. */
const SETTLE_MS = 250

/**
 * Calls `onChange` shortly after something it cares about changes in the
 * project. `wants` picks the changes; every "all" is wanted.
 */
export function useProjectLive(
  projectId: string | undefined,
  wants: (change: LiveChange) => boolean,
  onChange: () => void
) {
  const latest = React.useRef({ wants, onChange })
  React.useEffect(() => {
    latest.current = { wants, onChange }
  })

  React.useEffect(() => {
    if (!projectId) return
    let timer: number | undefined
    const unsubscribe = subscribe(projectId, (change) => {
      if (change !== "all" && !latest.current.wants(change)) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => latest.current.onChange(), SETTLE_MS)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [projectId])
}
