import * as React from "react"

import {
  loadBackgroundPreference,
  saveBackgroundPreference,
} from "@/lib/api/pomodoro/backgrounds"
import { productAuth, subscribeProductAuth } from "@/lib/pomodoro/auth-state"
import {
  GUEST_BACKGROUND_KEY,
  readGuestJson,
  writeGuestJson,
} from "@/lib/pomodoro/guest-storage"
import {
  DEFAULT_BACKGROUND,
  parseBackgroundReference,
  serializeBackgroundReference,
  type BackgroundReference,
} from "@/lib/pomodoro/background-catalog"

/**
 * The chosen background as a module-level store, like the sound engine:
 * the backgrounds page picks, and every PomodoroScreen draws it, without a
 * provider around the shell's tree. Saves are debounced; a failed load
 * never lets the default overwrite the stored choice.
 */

type Snapshot = {
  background: BackgroundReference
  canUsePremiumMedia: boolean
}

let state: Snapshot = {
  background: DEFAULT_BACKGROUND,
  canUsePremiumMedia: false,
}
const listeners = new Set<() => void>()
let hydrated = false
let hydrating = false
let lastSaved = ""
let saveTimer: number | null = null

function emit() {
  for (const listener of listeners) listener()
}

function persist() {
  if (!hydrated || typeof window === "undefined") return
  const snapshot = serializeBackgroundReference(state.background) ?? ""
  if (snapshot === lastSaved) return
  if (saveTimer !== null) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    lastSaved = serializeBackgroundReference(state.background) ?? ""
    if (!productAuth().authenticated) {
      writeGuestJson(GUEST_BACKGROUND_KEY, lastSaved)
      return
    }
    void saveBackgroundPreference(lastSaved || null)
      .then((saved) => {
        // Reconcile if the server rejected a background that vanished
        // between selecting and saving.
        const resolved = saved?.selectedBackground ?? null
        if ((resolved ?? "") !== lastSaved) {
          const reference = parseBackgroundReference(resolved)
          state = { ...state, background: reference ?? DEFAULT_BACKGROUND }
          lastSaved = serializeBackgroundReference(state.background) ?? ""
          emit()
        }
      })
      .catch(() => undefined)
  }, 500)
}

export function ensureBackgroundStore() {
  if (typeof window === "undefined" || hydrated || hydrating) return
  if (!productAuth().known) return
  if (!productAuth().authenticated) {
    // Guests never own uploads, so only a curated scene is honoured.
    const stored = parseBackgroundReference(
      readGuestJson<string>(GUEST_BACKGROUND_KEY)
    )
    state = {
      background: stored?.type === "scene" ? stored : DEFAULT_BACKGROUND,
      canUsePremiumMedia: false,
    }
    lastSaved = serializeBackgroundReference(state.background) ?? ""
    hydrated = true
    emit()
    return
  }
  hydrating = true
  void loadBackgroundPreference()
    .then((saved) => {
      const reference = parseBackgroundReference(saved.selectedBackground)
      // An upload whose address the server would not resolve — deleted, still
      // being prepared, or not theirs — falls back to the default scene rather
      // than leaving a blank screen behind the timer.
      const resolved: BackgroundReference | null =
        reference?.type === "media"
          ? saved.selectedUploadUrl
            ? {
                ...reference,
                mediaUrl: saved.selectedUploadUrl,
                // A background is only ever a picture or a clip; the sound
                // kind cannot reach here, and anything unexpected draws as a
                // picture rather than throwing.
                mediaKind: (saved.selectedUploadKind === "video"
                  ? "video"
                  : "image") as "image" | "video",
              }
            : null
          : reference
      state = {
        background: resolved ?? DEFAULT_BACKGROUND,
        canUsePremiumMedia: saved.canUsePremiumMedia === true,
      }
      lastSaved = serializeBackgroundReference(state.background) ?? ""
      hydrated = true
      emit()
    })
    .catch(() => {
      lastSaved = serializeBackgroundReference(state.background) ?? ""
      hydrated = true
      emit()
    })
    .finally(() => {
      hydrating = false
    })
}

export function chooseBackground(reference: BackgroundReference) {
  state = { ...state, background: reference }
  emit()
  persist()
}

/** A scene or upload whose file failed to load falls back to the default. */
export function fallBackToDefaultBackground() {
  if (serializeBackgroundReference(state.background) ===
      serializeBackgroundReference(DEFAULT_BACKGROUND))
    return
  state = { ...state, background: DEFAULT_BACKGROUND }
  emit()
  persist()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const serverSnapshot: Snapshot = state

export function useBackgroundSelection() {
  const snapshot = React.useSyncExternalStore(
    subscribe,
    () => state,
    () => serverSnapshot
  )
  React.useEffect(() => {
    ensureBackgroundStore()
  }, [])
  return {
    ...snapshot,
    chooseBackground,
    fallBackToDefault: fallBackToDefaultBackground,
  }
}

if (typeof window !== "undefined")
  subscribeProductAuth(() => {
    hydrated = false
    ensureBackgroundStore()
  })
