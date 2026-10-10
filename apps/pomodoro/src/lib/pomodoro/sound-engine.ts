import {
  loadSoundPreferences,
  saveSoundPreferences,
} from "@/lib/api/pomodoro/sounds"
import { productAuth, subscribeProductAuth } from "@/lib/pomodoro/auth-state"
import {
  GUEST_SOUND_KEY,
  readGuestJson,
  writeGuestJson,
} from "@/lib/pomodoro/guest-storage"
import {
  setCompletionAlertsEnabled,
  setCompletionChimes,
} from "@/lib/pomodoro/completion-alerts"
import { normalizeChime, type ChimeId } from "@/lib/pomodoro/chimes"
import {
  clampSoundVolume,
  sameSoundReference,
  soundSourceUrl,
  soundVolumeScale,
  type SoundReference,
} from "@/lib/pomodoro/sound-catalog"
import { DEFAULT_FADE_MS, SoundFader } from "@/lib/pomodoro/sound-fade"
import {
  initialSoundPlayerState,
  soundPlayerReducer,
  type SoundPlayerEvent,
  type SoundPlayerState,
} from "@/lib/pomodoro/sound-player"

/**
 * The sound player as a module-level engine.
 *
 * The old app wrapped the whole tree in a provider that owned two <audio>
 * decks. This app cannot wrap the shell's tree, so the decks live here:
 * created once per browser session, appended to <body>, reachable from the
 * header control, the sounds page and the timer alike. Playback survives
 * every route change because nothing React ever owns the audio.
 *
 * Which loop it holds is not its own choice. It follows the room you are in
 * (`room-media-store.ts`), through `followSound`: your personal room's sound,
 * or the hosted room's while you are in one. What it saves is only how it
 * sounds: volume, mute, the alerts and the chimes.
 *
 * Everything below is a no-op on the server; the first browser caller
 * initialises the engine.
 */

export type SleepTimerState = { minutes: number; remainingMs: number }

export type SoundEngineSnapshot = SoundPlayerState & {
  sleepTimer: SleepTimerState | null
  /** False locks the premium loops in the picker with their reason. */
  canUsePremiumMedia: boolean
}

type Snapshot = SoundEngineSnapshot

let state: Snapshot = {
  ...initialSoundPlayerState,
  sleepTimer: null,
  canUsePremiumMedia: false,
}
const listeners = new Set<() => void>()
let fader: SoundFader | null = null
let hydrated = false
let hydrating = false
let lastSaved = ""
let saveTimer: number | null = null
let sleepDeadline: { deadline: number; minutes: number } | null = null
let sleepInterval: number | null = null
// The last running edge from each clock: your own timer, and the hosted
// room's phases. Kept apart so one never cancels the other's edge.
const previousRunning: Record<"timer" | "room", boolean | null> = {
  timer: null,
  room: null,
}

function emit() {
  for (const listener of listeners) listener()
}

function setState(next: Partial<Snapshot>) {
  state = { ...state, ...next }
  emit()
}

function dispatch(event: SoundPlayerEvent) {
  const reduced = soundPlayerReducer(state, event)
  state = { ...state, ...reduced }
  emit()
  schedulePersist()
}

function preferenceSnapshot(current: Snapshot) {
  return JSON.stringify({
    soundVolume: current.volume,
    soundMuted: current.muted,
    completionAlerts: current.completionAlerts,
    focusChime: current.focusChime,
    breakChime: current.breakChime,
  })
}

// Debounced, and only after hydration, so defaults never overwrite the
// stored row and a volume drag becomes one write instead of forty.
function schedulePersist() {
  if (!hydrated || typeof window === "undefined") return
  const snapshot = preferenceSnapshot(state)
  if (snapshot === lastSaved) return
  if (saveTimer !== null) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    lastSaved = preferenceSnapshot(state)
    const payload = {
      soundVolume: state.volume,
      soundMuted: state.muted,
      completionAlerts: state.completionAlerts,
      focusChime: state.focusChime,
      breakChime: state.breakChime,
    }
    if (!productAuth().authenticated) {
      writeGuestJson(GUEST_SOUND_KEY, payload)
      return
    }
    void saveSoundPreferences(payload).catch(() => undefined)
  }, 600)
}

const cycleListeners = new Set<() => void>()

/**
 * Hears when the playing sound is about to end, which is when a shuffle or a
 * tags choice moves on to its next sound and theme (Tyler, 8 Oct 2026). The
 * room media store listens; the engine itself never picks.
 */
export function onSoundCycleEnding(listener: () => void) {
  cycleListeners.add(listener)
  return () => {
    cycleListeners.delete(listener)
  }
}

function labelForReference(reference: SoundReference | null) {
  if (!reference) return null
  if (reference.type === "media") return reference.label ?? "Your audio"
  return reference.label ?? reference.key
}

/**
 * The member's own volume times the sound's starting volume, which an admin
 * sets per catalogue sound so a loud track starts quieter. The member's slider
 * still reads what they set.
 */
function applyGain(reference: SoundReference | null = state.selected) {
  fader?.setUserGain((state.volume / 100) * soundVolumeScale(reference))
}

function ensureFader() {
  if (fader || typeof document === "undefined") return fader
  const a = document.createElement("audio")
  const b = document.createElement("audio")
  a.hidden = true
  b.hidden = true
  document.body.append(a, b)
  fader = new SoundFader(a, b, {
    onPlaying: () => dispatch({ type: "media-playing" }),
    onPause: () => dispatch({ type: "media-paused" }),
    onWaiting: () => dispatch({ type: "media-waiting" }),
    onBlocked: () => dispatch({ type: "media-blocked" }),
    onError: () => dispatch({ type: "media-error" }),
    onCycleEnding: () => {
      for (const listener of cycleListeners) listener()
    },
  })
  applyGain()
  fader.setMuted(state.muted)

  // Fades snap instantly when the OS asks for reduced motion.
  const media = window.matchMedia("(prefers-reduced-motion: reduce)")
  const applyMotion = () =>
    fader?.setFadeMs(media.matches ? 0 : DEFAULT_FADE_MS)
  applyMotion()
  media.addEventListener("change", applyMotion)

  // A focus starting fades the sound in; a pause, a stop or a break starting
  // fades it out. Tyler, 8 Oct 2026: "Change it so that break turns the sound
  // off."
  window.addEventListener("pomodoro:timer-running", ((event: Event) => {
    const { running, mode } = (
      event as CustomEvent<{ running: boolean; mode: string }>
    ).detail
    runningEdge("timer", running && mode === "focus")
  }) as EventListener)
  return fader
}

/**
 * Only genuine running edges count, so navigating between pages (which
 * remounts the timer hook) never fights a manual pause.
 */
function runningEdge(clock: "timer" | "room", running: boolean) {
  const wasRunning = previousRunning[clock]
  previousRunning[clock] = running
  if (running && wasRunning !== true) {
    if (state.selected && state.status !== "playing") {
      dispatch({
        type: "select",
        reference: state.selected,
        label: state.label ?? labelForReference(state.selected) ?? "",
      })
      applyGain()
      fader?.playSource(soundSourceUrl(state.selected))
    }
  } else if (!running && wasRunning === true) {
    if (state.status === "playing" || state.status === "loading")
      fader?.fadeOutPause()
  }
}

/**
 * The hosted room's clock counts as the timer: its focus starting starts the
 * room's sound, and a break or the room going back to waiting fades it out.
 * The caller passes whether the room is in a focus.
 *
 * `initial` is the first snapshot a page sees. It only records where the
 * room's clock is, because a reload never autoplays: a room found mid-focus
 * on arrival waits for its next edge, or for play.
 */
export function followRoomRunning(running: boolean, initial = false) {
  if (typeof window === "undefined") return
  ensureFader()
  if (initial) previousRunning.room = running
  else runningEdge("room", running)
}

/**
 * Holds the sound of the room you are in. Called by the room media store
 * whenever that changes.
 *
 * - `prime` is the page's first frame: the sound is held, silent, and nobody
 *   is told, because nothing has been drawn yet.
 * - `pick` is you putting a sound in your own room. Tyler's rule, 27 Sep
 *   2026: picking never plays, and the loop that was playing stops.
 * - `room` is the room changing under you: joining, leaving, or the host
 *   picking a new sound. A sound that was playing crossfades into the new
 *   one, so a room keeps one sound for everybody; a paused one stays paused.
 */
export function followSound(
  reference: SoundReference | null,
  reason: "prime" | "pick" | "room"
) {
  if (typeof window === "undefined") return
  if (sameSoundReference(state.selected, reference)) return
  const label = labelForReference(reference)
  if (reason === "prime") {
    state = {
      ...state,
      selected: reference,
      label,
      status: reference ? "paused" : "idle",
    }
    return
  }
  const active = ensureFader()
  if (!reference) {
    active?.fadeOutStop()
    cancelSleepTimer()
    dispatch({ type: "clear" })
    return
  }
  const playing = state.status === "playing" || state.status === "loading"
  if (reason === "room" && playing) {
    dispatch({ type: "select", reference, label: label ?? "" })
    applyGain(reference)
    active?.playSource(soundSourceUrl(reference))
    return
  }
  active?.fadeOutStop()
  dispatch({ type: "choose", reference, label: label ?? "" })
}

/** Loads the saved preferences once; safe to call from every consumer. */
export function ensureSoundEngine() {
  if (typeof window === "undefined") return
  ensureFader()
  if (hydrated || hydrating) return
  if (!productAuth().known) return
  if (!productAuth().authenticated) {
    // A guest's sound lives in the browser; premium loops stay locked.
    const saved = readGuestJson<Record<string, unknown>>(GUEST_SOUND_KEY) ?? {}
    state = {
      ...state,
      volume: clampSoundVolume(saved.soundVolume),
      muted: saved.soundMuted === true,
      completionAlerts: saved.completionAlerts === true,
      focusChime: normalizeChime(saved.focusChime),
      breakChime: normalizeChime(saved.breakChime),
      notice: null,
      canUsePremiumMedia: false,
    }
    lastSaved = preferenceSnapshot(state)
    applyGain()
    fader?.setMuted(state.muted)
    setCompletionAlertsEnabled(state.completionAlerts)
    setCompletionChimes({ focus: state.focusChime, break: state.breakChime })
    hydrated = true
    emit()
    return
  }
  hydrating = true
  void loadSoundPreferences()
    .then((saved) => {
      const volume = clampSoundVolume(saved.soundVolume)
      state = {
        ...state,
        volume,
        muted: saved.soundMuted === true,
        completionAlerts: saved.completionAlerts === true,
        focusChime: normalizeChime(saved.focusChime),
        breakChime: normalizeChime(saved.breakChime),
        notice: null,
        canUsePremiumMedia: saved.canUsePremiumMedia === true,
      }
      lastSaved = preferenceSnapshot(state)
      applyGain()
      fader?.setMuted(state.muted)
      setCompletionAlertsEnabled(state.completionAlerts)
      setCompletionChimes({ focus: state.focusChime, break: state.breakChime })
      hydrated = true
      emit()
    })
    .catch(() => {
      // A failed load must not let defaults auto-save over the stored row;
      // only a real user change may write after this.
      lastSaved = preferenceSnapshot(state)
      hydrated = true
      emit()
    })
    .finally(() => {
      hydrating = false
    })
}

export function subscribeSoundEngine(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function soundEngineState(): Snapshot {
  return state
}

export function togglePlayback() {
  const active = ensureFader()
  if (!state.selected) return
  // Loading counts as playing: the button already says Pause then.
  if (state.status === "playing" || state.status === "loading") {
    dispatch({ type: "pause" })
    active?.fadeOutPause()
    return
  }
  dispatch({
    type: "select",
    reference: state.selected,
    label: state.label ?? labelForReference(state.selected) ?? "",
  })
  applyGain()
  active?.playSource(soundSourceUrl(state.selected))
}

export function setVolume(volume: number) {
  dispatch({ type: "set-volume", volume })
  applyGain()
}

export function toggleMuted() {
  const muted = !state.muted
  dispatch({ type: "set-muted", muted })
  fader?.setMuted(muted)
}

export function setCompletionAlerts(enabled: boolean) {
  dispatch({ type: "set-completion-alerts", enabled })
  setCompletionAlertsEnabled(enabled)
}

/** Chooses the chime for a focus ending or a break ending. */
export function setChime(moment: "focus" | "break", chime: ChimeId) {
  dispatch({ type: "set-chime", moment, chime })
  setCompletionChimes({ focus: state.focusChime, break: state.breakChime })
}

// The sleep timer only fades the audio out; the focus timer is never touched.
export function startSleepTimer(minutes: number) {
  if (typeof window === "undefined") return
  sleepDeadline = { deadline: Date.now() + minutes * 60_000, minutes }
  if (sleepInterval !== null) window.clearInterval(sleepInterval)
  const tick = () => {
    if (!sleepDeadline) return
    const remaining = sleepDeadline.deadline - Date.now()
    if (remaining <= 0) {
      cancelSleepTimer()
      ensureFader()?.fadeOutPause()
    } else {
      setState({
        sleepTimer: { minutes: sleepDeadline.minutes, remainingMs: remaining },
      })
    }
  }
  tick()
  sleepInterval = window.setInterval(tick, 500)
}

export function cancelSleepTimer() {
  sleepDeadline = null
  if (sleepInterval !== null && typeof window !== "undefined")
    window.clearInterval(sleepInterval)
  sleepInterval = null
  if (state.sleepTimer) setState({ sleepTimer: null })
}

// Signing in (or out) swaps the data source underneath the engine.
if (typeof window !== "undefined")
  subscribeProductAuth(() => {
    hydrated = false
    ensureSoundEngine()
  })
