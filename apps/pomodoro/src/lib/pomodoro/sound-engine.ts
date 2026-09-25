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
import { setCompletionAlertsEnabled } from "@/lib/pomodoro/completion-alerts"
import {
  clampSoundVolume,
  curatedSounds,
  parseSoundReference,
  sameSoundReference,
  serializeSoundReference,
  soundSourceUrl,
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
let previousRunning: boolean | null = null

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
    selectedSound: serializeSoundReference(current.selected),
    soundVolume: current.volume,
    soundMuted: current.muted,
    completionAlerts: current.completionAlerts,
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
      selectedSound: serializeSoundReference(state.selected),
      soundVolume: state.volume,
      soundMuted: state.muted,
      completionAlerts: state.completionAlerts,
    }
    if (!productAuth().authenticated) {
      writeGuestJson(GUEST_SOUND_KEY, payload)
      return
    }
    void saveSoundPreferences(payload).catch(() => undefined)
  }, 600)
}

function labelForReference(reference: SoundReference | null) {
  if (!reference) return null
  if (reference.type === "media") return "Your audio"
  return (
    curatedSounds.find((sound) => sound.key === reference.key)?.label ??
    reference.key
  )
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
  })
  fader.setUserGain(state.volume / 100)
  fader.setMuted(state.muted)

  // Fades snap instantly when the OS asks for reduced motion.
  const media = window.matchMedia("(prefers-reduced-motion: reduce)")
  const applyMotion = () =>
    fader?.setFadeMs(media.matches ? 0 : DEFAULT_FADE_MS)
  applyMotion()
  media.addEventListener("change", applyMotion)

  // The timer's start fades the sound in and its pause/stop fades it out.
  // Only genuine running edges count, so navigating between pages (which
  // remounts the timer hook) never fights a manual pause.
  window.addEventListener("pomodoro:timer-running", ((event: Event) => {
    const running = (event as CustomEvent<{ running: boolean }>).detail.running
    const wasRunning = previousRunning
    previousRunning = running
    if (running && wasRunning !== true) {
      if (state.selected && state.status !== "playing") {
        dispatch({
          type: "select",
          reference: state.selected,
          label: state.label ?? labelForReference(state.selected) ?? "",
        })
        fader?.playSource(soundSourceUrl(state.selected))
      }
    } else if (!running && wasRunning === true) {
      if (state.status === "playing" || state.status === "loading")
        fader?.fadeOutPause()
    }
  }) as EventListener)
  return fader
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
    const selected = parseSoundReference(saved.selectedSound)
    state = {
      ...state,
      selected,
      label: labelForReference(selected),
      status: selected ? "paused" : "idle",
      volume: clampSoundVolume(saved.soundVolume),
      muted: saved.soundMuted === true,
      completionAlerts: saved.completionAlerts === true,
      notice: null,
      canUsePremiumMedia: false,
    }
    lastSaved = preferenceSnapshot(state)
    fader?.setUserGain(state.volume / 100)
    fader?.setMuted(state.muted)
    setCompletionAlertsEnabled(state.completionAlerts)
    hydrated = true
    emit()
    return
  }
  hydrating = true
  void loadSoundPreferences()
    .then((saved) => {
      const selected = parseSoundReference(saved.selectedSound)
      const volume = clampSoundVolume(saved.soundVolume)
      state = {
        ...state,
        selected,
        label: labelForReference(selected),
        status: selected ? "paused" : "idle",
        volume,
        muted: saved.soundMuted === true,
        completionAlerts: saved.completionAlerts === true,
        notice: null,
        canUsePremiumMedia: saved.canUsePremiumMedia === true,
      }
      lastSaved = preferenceSnapshot(state)
      fader?.setUserGain(state.volume / 100)
      fader?.setMuted(state.muted)
      setCompletionAlertsEnabled(state.completionAlerts)
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

export function selectSound(reference: SoundReference, label: string) {
  const active = ensureFader()
  if (sameSoundReference(state.selected, reference) && state.status === "playing") {
    active?.fadeOutPause()
    return
  }
  dispatch({ type: "select", reference, label })
  active?.playSource(soundSourceUrl(reference))
}

export function togglePlayback() {
  const active = ensureFader()
  if (!state.selected) return
  if (state.status === "playing") {
    active?.fadeOutPause()
    return
  }
  dispatch({
    type: "select",
    reference: state.selected,
    label: state.label ?? labelForReference(state.selected) ?? "",
  })
  active?.playSource(soundSourceUrl(state.selected))
}

export function clearSound() {
  ensureFader()?.fadeOutStop()
  cancelSleepTimer()
  dispatch({ type: "clear" })
}

export function setVolume(volume: number) {
  dispatch({ type: "set-volume", volume })
  fader?.setUserGain(clampSoundVolume(volume) / 100)
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
