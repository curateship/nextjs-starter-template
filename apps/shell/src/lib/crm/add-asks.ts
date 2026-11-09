import * as React from "react"

/**
 * "Add a subscriber" and "Add a lead" from the CRM's left header + (Tyler,
 * 9 Nov 2026): the section moves if it has to, then its New button opens
 * straight on the form. A hand-over held here, not a key in the address, so a
 * reload or Back never opens the form again.
 */
export type CrmAddKind = "subscriber" | "lead"

const pending = new Set<CrmAddKind>()
const listeners = new Map<CrmAddKind, Set<() => void>>()

export function askToAdd(kind: CrmAddKind) {
  const waiting = listeners.get(kind)
  if (waiting?.size) waiting.forEach((listener) => listener())
  else pending.add(kind)
}

/** Runs `onAsk` when the + asks for this kind, now or once it mounts. */
export function useAddAsk(kind: CrmAddKind, onAsk: () => void) {
  const latest = React.useRef(onAsk)
  React.useEffect(() => {
    latest.current = onAsk
  })
  React.useEffect(() => {
    const listener = () => latest.current()
    const set = listeners.get(kind) ?? new Set()
    set.add(listener)
    listeners.set(kind, set)
    if (pending.delete(kind)) listener()
    return () => {
      set.delete(listener)
    }
  }, [kind])
}
