import * as React from "react"

import { loadBackdropLook, saveBackdropLook } from "@/lib/api/pomodoro/backdrop-look"
import { productAuth, subscribeProductAuth } from "@/lib/pomodoro/auth-state"
import { readGuestJson, writeGuestJson } from "@/lib/pomodoro/guest-storage"
import { MediaBootstrapContext } from "@/lib/pomodoro/room-media-store"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * How the scene behind the timer is drawn, apart from which scene it is
 * (uploads-and-sharing task 08, Parts 2 and 4). See "Dimming the scene" and
 * "A picture drifts" in `workspace/docs/backgrounds.md`.
 *
 * - `dim`: how dark the layer between the scene and the page is, 0 to 70 out
 *   of 100. 0 draws no layer, so nobody sees a change until they move it.
 * - `drift`: a slow zoom on a picture the member uploaded. A film never
 *   drifts, and nobody who asked their computer for less movement sees it.
 *
 * A member's are saved in their settings, each on its own; a guest's stay in
 * this browser. The page's loader sends a member's with the first frame, so
 * a dimmed scene is dim from the start rather than darkening a moment later.
 */

export const MAX_BACKDROP_DIM = 70

export type BackdropLook = { dim: number; drift: boolean }

export const DEFAULT_BACKDROP_LOOK: BackdropLook = { dim: 0, drift: true }

const GUEST_BACKDROP_KEY = "pomodoro:backdrop:v1"

/** A slider save waits this long after the last move, as every setting does. */
const SAVE_DELAY_MS = 700

export function clampBackdropDim(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.min(MAX_BACKDROP_DIM, Math.max(0, Math.round(value)))
}

function lookFrom(value: unknown): BackdropLook {
  const stored = (value ?? {}) as Partial<Record<keyof BackdropLook, unknown>>
  return {
    dim: clampBackdropDim(stored.dim),
    drift: typeof stored.drift === "boolean" ? stored.drift : DEFAULT_BACKDROP_LOOK.drift,
  }
}

let state: BackdropLook = DEFAULT_BACKDROP_LOOK
/** What the server last agreed to, to put back when a save is refused. */
let saved: BackdropLook = DEFAULT_BACKDROP_LOOK
let primed = false
let dimTimer: number | null = null
const listeners = new Set<() => void>()

function setState(next: BackdropLook) {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * A member's look from the page's loader, taken on the very first render so
 * the browser draws what the server drew. Only a member's loader sends one,
 * so a page without it waits for the layout to say who is here
 * (`reloadBackdropLook`). Written without telling anyone, because this runs
 * while React is rendering.
 */
function primeBackdropLook(seed: BackdropLook | null) {
  if (typeof window === "undefined" || primed || !seed) return
  primed = true
  saved = lookFrom(seed)
  state = saved
}

async function reloadBackdropLook() {
  primed = true
  if (!productAuth().authenticated) {
    saved = lookFrom(readGuestJson(GUEST_BACKDROP_KEY))
    setState(saved)
    return
  }
  try {
    saved = lookFrom(await loadBackdropLook())
    setState(saved)
  } catch {
    // A failed read keeps drawing what is on screen; the next page load asks
    // again.
  }
}

async function save(change: Partial<BackdropLook>) {
  if (!productAuth().authenticated) {
    saved = { ...saved, ...change }
    writeGuestJson(GUEST_BACKDROP_KEY, saved)
    return
  }
  try {
    await saveBackdropLook("dim" in change ? { dim: change.dim! } : { drift: change.drift! })
    saved = { ...saved, ...change }
  } catch {
    setState({ ...state, ...pick(saved, change) })
    showErrorToast("That did not save. Try again.")
  }
}

function pick(look: BackdropLook, change: Partial<BackdropLook>): Partial<BackdropLook> {
  return "dim" in change ? { dim: look.dim } : { drift: look.drift }
}

/**
 * Moves the dim. The scene follows at once; the save goes 700ms after the
 * last move, or straight away when the slider is let go (`commit`).
 */
export function setBackdropDim(value: number, commit = false) {
  const dim = clampBackdropDim(value)
  setState({ ...state, dim })
  if (dimTimer !== null) window.clearTimeout(dimTimer)
  dimTimer = null
  if (dim === saved.dim) return
  if (commit) {
    void save({ dim })
    return
  }
  dimTimer = window.setTimeout(() => {
    dimTimer = null
    void save({ dim })
  }, SAVE_DELAY_MS)
}

/** Switches the drift on or off, saved the moment it changes. */
export function setBackdropDrift(drift: boolean) {
  setState({ ...state, drift })
  void save({ drift })
}

/**
 * The look on screen. The server draws with the loader's answer, and the
 * browser takes it into the store on its first render, so the two agree.
 */
export function useBackdropLook() {
  const bootstrap = React.useContext(MediaBootstrapContext)
  const seed = bootstrap?.look ?? null
  primeBackdropLook(seed)
  const serverValue = React.useMemo(() => lookFrom(seed), [seed])
  return React.useSyncExternalStore(
    subscribe,
    () => state,
    () => serverValue
  )
}

// Signing in, out, or as somebody else swaps whose look this is: a guest's
// comes from this browser, a member's from the server. The first answer is
// not a swap when the loader's look was already for that person.
let authKnown = false
if (typeof window !== "undefined") {
  subscribeProductAuth(() => {
    const firstAnswer = !authKnown
    authKnown = true
    if (firstAnswer && primed) return
    void reloadBackdropLook()
  })
}
