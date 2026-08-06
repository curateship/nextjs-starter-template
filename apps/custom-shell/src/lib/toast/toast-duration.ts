import * as React from "react"

import { clampToastSeconds, DEFAULT_TOAST_SECONDS } from "@/lib/toast/toast-seconds"

/**
 * How long a success toast stays up, shared between the shell (which knows the
 * saved setting) and the Toaster (which does not).
 *
 * The Toaster is mounted in `__root.tsx`, above the router outlet, because the
 * sign-in and reset-password pages need toasts too and never mount ShellLayout.
 * That puts it out of reach of the shell's config, so ShellLayout publishes the
 * setting here and the Toaster subscribes. A plain module store rather than a
 * context: the two components are siblings, so no provider can sit between them
 * without also wrapping the pages that have no config to give.
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
    // The server renders before any config is loaded; hydration corrects it.
    () => DEFAULT_TOAST_SECONDS
  )

  return seconds * 1000
}
