import * as React from "react"

import { requestSteadyCopy, type SteadyCopyState } from "@/lib/api/video/steady-copies"

/**
 * What the editor knows about each steadied copy (steady-shaky-footage.md),
 * kept outside React so the preview and the inspector read one answer and
 * only one of them asks the server. A copy still being made is asked about
 * again every few seconds until it is ready or gives up, the same way a
 * cleaned sound is (sound-tool-store.ts).
 */

const POLL_MS = 4000
// Half an hour of asking: two passes over a long 4K video take a while.
const MAX_POLLS = 450
const TOO_LONG_MESSAGE = "Steadying the video is taking too long"

const listeners = new Set<() => void>()
const states = new Map<string, SteadyCopyState>()
const polls = new Map<string, number>()
const asking = new Set<string>()

function signature(state: SteadyCopyState | undefined) {
  if (!state || state.status === "preparing") return "preparing"
  return state.status === "ready" ? `ready ${state.url}` : `failed ${state.error}`
}

function changed() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function ask(mediaId: string, retry = false) {
  if (asking.has(mediaId)) return
  asking.add(mediaId)
  const before = signature(states.get(mediaId))
  try {
    states.set(mediaId, await requestSteadyCopy(mediaId, retry))
  } catch (error) {
    states.set(mediaId, {
      status: "failed",
      error: error instanceof Error ? error.message : "Steadying the video failed",
    })
  } finally {
    asking.delete(mediaId)
  }
  if (signature(states.get(mediaId)) !== before) changed()
  if (states.get(mediaId)?.status !== "preparing") return
  const count = (polls.get(mediaId) ?? 0) + 1
  polls.set(mediaId, count)
  if (count < MAX_POLLS) {
    setTimeout(() => void ask(mediaId), POLL_MS)
  } else {
    states.set(mediaId, { status: "failed", error: TOO_LONG_MESSAGE })
    changed()
  }
}

/** Put a copy that failed back in the worker's queue. */
export function retrySteadyCopy(mediaId: string) {
  states.set(mediaId, { status: "preparing" })
  polls.delete(mediaId)
  changed()
  void ask(mediaId, true)
}

type SteadyClip = { kind: string; mediaId?: string; steady?: boolean }

/** Where the steadied copy of every video these clips steady stands, by file. */
export function useSteadyCopies(clips: SteadyClip[]) {
  const wanted = React.useMemo(
    () =>
      [
        ...new Set(
          clips
            .filter((clip) => clip.kind === "video" && clip.steady && clip.mediaId)
            .map((clip) => clip.mediaId!)
        ),
      ],
    [clips]
  )
  React.useEffect(() => {
    for (const mediaId of wanted) {
      if (states.has(mediaId) || asking.has(mediaId)) continue
      states.set(mediaId, { status: "preparing" })
      void ask(mediaId)
    }
  }, [wanted])
  const read = () => wanted.map((mediaId) => signature(states.get(mediaId))).join("|")
  const seen = React.useSyncExternalStore(subscribe, read, read)
  return React.useMemo(() => {
    void seen
    return new Map(wanted.map((mediaId) => [mediaId, states.get(mediaId) ?? { status: "preparing" as const }]))
  }, [wanted, seen])
}
