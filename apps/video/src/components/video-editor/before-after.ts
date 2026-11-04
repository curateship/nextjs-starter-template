import * as React from "react"

/**
 * The picture a clip showed before an AI change, so the preview can draw the
 * before and after slider over it (picture-clean-up.md). One clip at a time,
 * held outside React's state like the face choices, and gone once another
 * clip is picked or Done is pressed. Undo brings the old picture back on the
 * timeline whatever this holds.
 */
type BeforeAfter = { clipId: string; beforeUrl: string } | null

let current: BeforeAfter = null
const listeners = new Set<() => void>()

export function showBeforeAfter(next: BeforeAfter) {
  current = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useBeforeAfter() {
  return React.useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  )
}
