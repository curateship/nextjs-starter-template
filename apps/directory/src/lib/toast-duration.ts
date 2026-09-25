import * as React from "react"

import { clampToastSeconds, DEFAULT_TOAST_SECONDS } from "@/lib/toast-seconds"

/**
 * How long a success toast stays up, shared between the layout (which knows the
 * saved setting) and the Toaster (which does not).
 *
 * The Toaster is mounted from `DeferredScripts` in the root layout, above and
 * outside the admin shell, because public site pages and the signed-out auth
 * pages need toasts too and never mount the admin shell. That puts it out of
 * reach of the admin settings context. A plain module store rather than a
 * context: the two are siblings, so no provider could sit between them without
 * also wrapping every public page.
 *
 * Error toasts ignore this — `showErrorToast` pins them until dismissed.
 */
let toastSeconds = DEFAULT_TOAST_SECONDS
const listeners = new Set<() => void>()

export function setToastSeconds(value: number) {
  const next = clampToastSeconds(value)
  if (next === toastSeconds) return
  toastSeconds = next
  listeners.forEach((notify) => notify())
}

function subscribe(notify: () => void) {
  listeners.add(notify)
  return () => {
    listeners.delete(notify)
  }
}

/** Milliseconds, ready for sonner's `duration` prop. */
export function useToastDurationMs() {
  const seconds = React.useSyncExternalStore(
    subscribe,
    () => toastSeconds,
    // The server renders before the saved setting is published; hydration corrects it.
    () => DEFAULT_TOAST_SECONDS
  )

  return seconds * 1000
}
