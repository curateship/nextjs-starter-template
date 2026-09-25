/**
 * Guest storage: the whole product works without an account, saved in the
 * browser. Every read and write is wrapped so blocked storage (private
 * windows, cleared site data) never breaks the page — it just means a
 * fresh start.
 */

export const GUEST_STATE_KEY = "pomodoro:guest:v1"
export const GUEST_SOUND_KEY = "pomodoro:sound:v1"
export const GUEST_BACKGROUND_KEY = "pomodoro:background:v1"
export const GUEST_PRESETS_KEY = "pomodoro:presets:v1"

export function readGuestJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Blocked storage cannot be cleaned either; nothing to do.
    }
    return null
  }
}

export function writeGuestJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage is blocked or full; the session simply will not persist.
  }
}

export function removeGuestKey(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing to do.
  }
}
