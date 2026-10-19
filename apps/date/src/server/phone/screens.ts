/**
 * A phone's live screen, passed from the phone to a window on the dashboard.
 *
 * Promo's choice, kept here: pictures a few times a second rather than video.
 * The phone sends the newest picture to `/api/phone/screen` over the
 * connection it already opens, and the window asks this server for the
 * newest one. Nothing on the phone is reachable from outside.
 *
 * Kept in this process's memory, never the database: a picture is stale in a
 * second and writing three a second would only churn the database. Both the
 * phone and the window talk to the web server, which is one process, so they
 * meet here. A restart loses only the picture on screen. Taps in the window
 * are not kept here: they become ordinary tap actions (`actions.ts`).
 *
 * Copied from Promo's `screens.ts` and trimmed to one phone, no texted codes
 * and no control hold.
 */

/** A window that has not asked for a picture this long ago is closed, and the phone stops sending. */
const WATCH_MS = 10_000

export type ScreenFrame = {
  jpeg: string
  /** The picture's own size. */
  width: number
  height: number
  /** The phone's real screen size, which taps are given in. */
  screenWidth: number
  screenHeight: number
  seq: number
  at: number
}

type Screen = { watchedAt: number; frame: ScreenFrame | null }

// On `globalThis` so the dev server's module reloads keep the windows open.
const holder = globalThis as unknown as { __datePhoneScreens?: Map<string, Screen> }
const screens = (holder.__datePhoneScreens ??= new Map<string, Screen>())

/** The window asked for a picture: the phone is being watched, and here is the newest one there is. */
export function watchScreen(phoneId: string, now: number = Date.now()): ScreenFrame | null {
  let screen = screens.get(phoneId)
  if (!screen) {
    screen = { watchedAt: now, frame: null }
    screens.set(phoneId, screen)
  }
  screen.watchedAt = now
  return screen.frame
}

/** The window closed: the phone stops sending at its next ask. */
export function closeScreen(phoneId: string): void {
  screens.delete(phoneId)
}

/** Whether a window asked for this phone's screen in the last ten seconds. */
export function isWatched(phoneId: string, now: number = Date.now()): boolean {
  const screen = screens.get(phoneId)
  if (!screen) return false
  if (now - screen.watchedAt > WATCH_MS) {
    screens.delete(phoneId)
    return false
  }
  return true
}

/**
 * The phone's turn: it hands in the newest picture while someone watches,
 * and is told whether anyone still is. A picture nobody asked for is dropped.
 */
export function receiveFrame(
  phoneId: string,
  frame: Omit<ScreenFrame, "seq" | "at"> | null,
  now: number = Date.now()
): { watched: boolean } {
  if (!isWatched(phoneId, now)) return { watched: false }
  const screen = screens.get(phoneId)
  if (screen && frame) screen.frame = { ...frame, seq: (screen.frame?.seq ?? 0) + 1, at: now }
  return { watched: true }
}
