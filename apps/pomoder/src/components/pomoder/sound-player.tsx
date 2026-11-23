import * as React from "react"
import { Loader2, Moon, Pause, Play, Volume2, VolumeX, X } from "lucide-react"

import { loadUserSoundPreferences, saveUserSoundPreferences } from "@/lib/api/productivity"
import { setCompletionAlertsEnabled } from "@/lib/completion-alerts"
import {
  curatedSounds,
  parseSoundReference,
  sameSoundReference,
  serializeSoundReference,
  soundSourceUrl,
  clampSoundVolume,
  type SoundReference,
} from "@/lib/sound-catalog"
import { DEFAULT_FADE_MS, SoundFader } from "@/lib/sound-fade"
import { formatSleepRemaining, SLEEP_TIMER_PRESETS } from "@/lib/sleep-timer"
import {
  initialSoundPlayerState,
  soundPlayerReducer,
  type SoundPlayerState,
} from "@/lib/sound-player"

const GUEST_SOUND_KEY = "pomoder:sound:v1"

type SleepTimerState = { minutes: number; remainingMs: number }

type SoundPlayerContextValue = {
  state: SoundPlayerState
  selectSound: (reference: SoundReference, label: string) => void
  togglePlayback: () => void
  clearSound: () => void
  setVolume: (volume: number) => void
  toggleMuted: () => void
  setCompletionAlerts: (enabled: boolean) => void
  markMediaUnavailable: (mediaId: string) => void
  resolveMediaLabel: (mediaId: string, label: string) => void
  sleepTimer: SleepTimerState | null
  startSleepTimer: (minutes: number) => void
  cancelSleepTimer: () => void
}

const SoundPlayerContext = React.createContext<SoundPlayerContextValue | null>(null)

export function useSoundPlayer() {
  const context = React.useContext(SoundPlayerContext)
  if (!context) throw new Error("useSoundPlayer must be used inside SoundPlayerProvider")
  return context
}

function labelForReference(reference: SoundReference | null) {
  if (!reference) return null
  if (reference.type === "media") return "Your audio"
  return curatedSounds.find((sound) => sound.key === reference.key)?.label ?? reference.key
}

function preferenceSnapshot(selected: SoundReference | null, volume: number, muted: boolean, completionAlerts: boolean) {
  return JSON.stringify({ selectedSound: serializeSoundReference(selected), soundVolume: volume, soundMuted: muted, completionAlerts })
}

export function SoundPlayerProvider({ authenticated, children }: { authenticated: boolean; children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(soundPlayerReducer, initialSoundPlayerState)
  const [hydrated, setHydrated] = React.useState(false)
  const [sleepDeadline, setSleepDeadline] = React.useState<{ deadline: number; minutes: number } | null>(null)
  const [sleepRemainingMs, setSleepRemainingMs] = React.useState(0)
  const deckARef = React.useRef<HTMLAudioElement>(null)
  const deckBRef = React.useRef<HTMLAudioElement>(null)
  const faderRef = React.useRef<SoundFader | null>(null)
  const lastSavedRef = React.useRef("")

  // The two decks let starting, stopping, and switching sounds glide. Building
  // the fader here keeps all playback status flowing through the reducer.
  React.useEffect(() => {
    const a = deckARef.current
    const b = deckBRef.current
    if (!a || !b) return
    const fader = new SoundFader(a, b, {
      onPlaying: () => dispatch({ type: "media-playing" }),
      onPause: () => dispatch({ type: "media-paused" }),
      onWaiting: () => dispatch({ type: "media-waiting" }),
      onBlocked: () => dispatch({ type: "media-blocked" }),
      onError: () => dispatch({ type: "media-error" }),
    })
    faderRef.current = fader
    return () => {
      fader.dispose()
      faderRef.current = null
    }
  }, [])

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => faderRef.current?.setFadeMs(media.matches ? 0 : DEFAULT_FADE_MS)
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [])

  React.useEffect(() => {
    let cancelled = false
    const hydrate = (raw: unknown) => {
      const saved = (raw && typeof raw === "object" ? raw : {}) as { selectedSound?: unknown; soundVolume?: unknown; soundMuted?: unknown; completionAlerts?: unknown }
      const selected = parseSoundReference(saved.selectedSound)
      const volume = clampSoundVolume(typeof saved.soundVolume === "number" ? saved.soundVolume : undefined)
      lastSavedRef.current = preferenceSnapshot(selected, volume, saved.soundMuted === true, saved.completionAlerts === true)
      dispatch({ type: "hydrate", selected, label: labelForReference(selected), volume, muted: saved.soundMuted === true, completionAlerts: saved.completionAlerts === true })
      setHydrated(true)
    }
    if (authenticated) {
      void loadUserSoundPreferences().then((preferences) => { if (!cancelled) hydrate(preferences) }).catch(() => {
        if (cancelled) return
        // A failed load must not let the defaults auto-save over stored
        // preferences; only a real user change may write after this.
        lastSavedRef.current = preferenceSnapshot(initialSoundPlayerState.selected, initialSoundPlayerState.volume, initialSoundPlayerState.muted, initialSoundPlayerState.completionAlerts)
        setHydrated(true)
      })
      return () => { cancelled = true }
    }
    const timer = window.setTimeout(() => {
      try { hydrate(JSON.parse(window.localStorage.getItem(GUEST_SOUND_KEY) || "{}")) } catch { setHydrated(true) }
    }, 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [authenticated])

  React.useEffect(() => {
    if (!hydrated) return
    const payload = { selectedSound: serializeSoundReference(state.selected), soundVolume: state.volume, soundMuted: state.muted, completionAlerts: state.completionAlerts }
    const snapshot = preferenceSnapshot(state.selected, state.volume, state.muted, state.completionAlerts)
    if (snapshot === lastSavedRef.current) return
    if (!authenticated) {
      lastSavedRef.current = snapshot
      window.localStorage.setItem(GUEST_SOUND_KEY, snapshot)
      return
    }
    const timer = window.setTimeout(() => {
      lastSavedRef.current = snapshot
      void saveUserSoundPreferences(payload).catch(() => undefined)
    }, 600)
    return () => window.clearTimeout(timer)
  }, [authenticated, hydrated, state.completionAlerts, state.muted, state.selected, state.volume])

  React.useEffect(() => {
    faderRef.current?.setUserGain(state.volume / 100)
    faderRef.current?.setMuted(state.muted)
  }, [state.muted, state.volume])

  React.useEffect(() => {
    setCompletionAlertsEnabled(state.completionAlerts)
  }, [state.completionAlerts])

  // Keep the latest player state readable from the timer-sync listener below
  // without resubscribing on every change.
  const stateRef = React.useRef(state)
  React.useEffect(() => { stateRef.current = state })

  // Sync the ambient sound to the focus timer. When the timer starts, the
  // selected sound fades in; when it pauses or stops, the sound fades out. Only
  // real running transitions act, so navigating pages or manually pausing the
  // sound never fights the user.
  React.useEffect(() => {
    let previousRunning: boolean | null = null
    const onRunning = (event: Event) => {
      const running = (event as CustomEvent<{ running: boolean }>).detail.running
      const wasRunning = previousRunning
      previousRunning = running
      const current = stateRef.current
      if (running && wasRunning !== true) {
        if (current.selected && current.status !== "playing") {
          dispatch({ type: "select", reference: current.selected, label: current.label ?? labelForReference(current.selected) ?? "" })
          faderRef.current?.playSource(soundSourceUrl(current.selected))
        }
      } else if (!running && wasRunning === true) {
        if (current.status === "playing" || current.status === "loading") {
          faderRef.current?.fadeOutPause()
        }
      }
    }
    window.addEventListener("pomoder:timer-running", onRunning)
    return () => window.removeEventListener("pomoder:timer-running", onRunning)
  }, [])

  // The sleep timer only fades the audio out; it never touches the focus timer.
  React.useEffect(() => {
    if (!sleepDeadline) {
      setSleepRemainingMs(0)
      return
    }
    const tick = () => {
      const remaining = sleepDeadline.deadline - Date.now()
      if (remaining <= 0) {
        setSleepDeadline(null)
        setSleepRemainingMs(0)
        faderRef.current?.fadeOutPause()
      } else {
        setSleepRemainingMs(remaining)
      }
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [sleepDeadline])

  const selectSound = (reference: SoundReference, label: string) => {
    if (sameSoundReference(state.selected, reference) && state.status === "playing") {
      faderRef.current?.fadeOutPause()
      return
    }
    dispatch({ type: "select", reference, label })
    faderRef.current?.playSource(soundSourceUrl(reference))
  }

  const togglePlayback = () => {
    if (!state.selected) return
    if (state.status === "playing") {
      faderRef.current?.fadeOutPause()
      return
    }
    dispatch({ type: "select", reference: state.selected, label: state.label ?? labelForReference(state.selected) ?? "" })
    faderRef.current?.playSource(soundSourceUrl(state.selected))
  }

  const clearSound = () => {
    faderRef.current?.fadeOutStop()
    setSleepDeadline(null)
    dispatch({ type: "clear" })
  }

  const setVolume = (volume: number) => dispatch({ type: "set-volume", volume })
  const toggleMuted = () => dispatch({ type: "set-muted", muted: !state.muted })
  const setCompletionAlerts = (enabled: boolean) => dispatch({ type: "set-completion-alerts", enabled })
  const startSleepTimer = (minutes: number) => setSleepDeadline({ deadline: Date.now() + minutes * 60_000, minutes })
  const cancelSleepTimer = () => setSleepDeadline(null)

  const markMediaUnavailable = (mediaId: string) => {
    if (state.selected?.type !== "media" || state.selected.mediaId !== mediaId) return
    faderRef.current?.hardStop()
    dispatch({ type: "media-unavailable" })
  }

  const resolveMediaLabel = (mediaId: string, label: string) => {
    if (state.selected?.type === "media" && state.selected.mediaId === mediaId) dispatch({ type: "resolve-label", label })
  }

  const value: SoundPlayerContextValue = {
    state,
    selectSound,
    togglePlayback,
    clearSound,
    setVolume,
    toggleMuted,
    setCompletionAlerts,
    markMediaUnavailable,
    resolveMediaLabel,
    sleepTimer: sleepDeadline ? { minutes: sleepDeadline.minutes, remainingMs: sleepRemainingMs } : null,
    startSleepTimer,
    cancelSleepTimer,
  }

  return (
    <SoundPlayerContext.Provider value={value}>
      {/* Two decks live at the shell level so playback survives route changes
          and one sound can crossfade into the next. The SoundFader wires their
          media events; they carry no React handlers of their own. */}
      <audio ref={deckARef} hidden preload="none" />
      <audio ref={deckBRef} hidden preload="none" />
      {children}
    </SoundPlayerContext.Provider>
  )
}

export function HeaderSoundPlayer() {
  const player = useSoundPlayer()
  const { state, sleepTimer } = player
  if (!state.selected && !state.notice) return null
  const playing = state.status === "playing"
  const loading = state.status === "loading"
  const silent = state.muted || state.volume === 0
  return (
    <div className="header-sound-player">
      {state.selected ? (
        <>
          <button className="player-toggle" onClick={player.togglePlayback} aria-label={playing ? `Pause ${state.label}` : `Play ${state.label}`}>
            {loading ? <Loader2 className="player-spinner" aria-hidden="true" /> : playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <span className="player-label" title={state.label ?? undefined}>{state.label}</span>
          <button onClick={player.toggleMuted} aria-pressed={state.muted} aria-label={state.muted ? "Unmute sound" : "Mute sound"}>
            {silent ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </button>
          <input
            className="player-volume"
            type="range"
            min={0}
            max={100}
            step={1}
            value={state.volume}
            onChange={(event) => player.setVolume(event.target.valueAsNumber)}
            aria-label="Sound volume"
          />
          <SleepTimerControl sleepTimer={sleepTimer} onStart={player.startSleepTimer} onCancel={player.cancelSleepTimer} />
        </>
      ) : null}
      <button onClick={player.clearSound} aria-label="Stop sound">
        <X aria-hidden="true" />
      </button>
      {state.notice ? <small className="player-notice" role="status">{state.notice}</small> : null}
    </div>
  )
}

function SleepTimerControl({
  sleepTimer,
  onStart,
  onCancel,
}: {
  sleepTimer: SleepTimerState | null
  onStart: (minutes: number) => void
  onCancel: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [open])
  const remaining = sleepTimer ? formatSleepRemaining(sleepTimer.remainingMs) : null
  return (
    <div className="player-sleep" ref={rootRef}>
      <button
        className={`player-sleep-toggle ${sleepTimer ? "is-active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={remaining ? `Sleep timer, ${remaining} remaining` : "Set a sleep timer"}
      >
        <Moon aria-hidden="true" />
        {remaining ? <span className="player-sleep-remaining">{remaining}</span> : null}
      </button>
      {open ? (
        <div className="sleep-popover" role="dialog" aria-label="Sleep timer">
          <h2>Sleep timer</h2>
          <p>Let the sound fade out on its own.</p>
          {sleepTimer ? (
            <div className="sleep-active">
              <span className="sleep-count">{remaining}</span>
              <small>until the sound fades out</small>
              <button className="sleep-cancel" onClick={() => { onCancel(); setOpen(false) }}>Cancel timer</button>
            </div>
          ) : (
            <div className="sleep-presets">
              {SLEEP_TIMER_PRESETS.map((minutes) => (
                <button key={minutes} onClick={() => onStart(minutes)}>{minutes} min</button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
