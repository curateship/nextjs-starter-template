import * as React from "react"

import {
  loadFloatingTimerSetting,
  saveFloatingTimerSetting,
} from "@/lib/api/pomodoro/floating-timer"
import { productAuth, subscribeProductAuth } from "@/lib/pomodoro/auth-state"
import { readGuestJson, writeGuestJson } from "@/lib/pomodoro/guest-storage"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Whether the floating timer opens by itself when a focus starts: the
 * member's switch in Settings → Timer, on until switched off. Saved to the
 * account, and in the browser for a guest. One module-level fact, because the
 * window that reads it lives outside any page.
 */

export const GUEST_FLOATING_TIMER_KEY = "pomodoro:floating-timer:v1"

let enabled = true
// Bumped by every flip, so an account read that was already on its way when
// the switch was pressed cannot put the old answer back on screen.
let flips = 0
const listeners = new Set<() => void>()

function set(next: boolean) {
  if (next === enabled) return
  enabled = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Reads the saved choice for whoever is using the app now. */
function hydrate() {
  const auth = productAuth()
  if (!auth.known) return
  if (!auth.authenticated) {
    set(readGuestJson<{ enabled?: unknown }>(GUEST_FLOATING_TIMER_KEY)?.enabled !== false)
    return
  }
  const flipsAtStart = flips
  loadFloatingTimerSetting().then(
    (saved) => {
      if (flips === flipsAtStart) set(saved.enabled)
    },
    // Unread, it stays on: the window opening once too often is the smaller
    // surprise than a switch that looks off and is not.
    () => undefined
  )
}

if (typeof window !== "undefined") {
  subscribeProductAuth(hydrate)
  hydrate()
}

export function floatingTimerEnabled() {
  return enabled
}

export function useFloatingTimerEnabled() {
  return React.useSyncExternalStore(subscribe, () => enabled, () => true)
}

/** Flips the switch and saves it. A refused save puts it back and says so. */
export function setFloatingTimerEnabled(next: boolean) {
  const previous = enabled
  flips += 1
  set(next)
  if (!productAuth().authenticated) {
    writeGuestJson(GUEST_FLOATING_TIMER_KEY, { enabled: next })
    return
  }
  saveFloatingTimerSetting(next).catch(() => {
    set(previous)
    showErrorToast("The floating timer setting could not be saved.")
  })
}
