import * as React from "react"
import { Loader2, Pause, Play, Volume2, VolumeX, X } from "lucide-react"

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
import {
  initialSoundPlayerState,
  soundPlayerReducer,
  type SoundPlayerState,
} from "@/lib/sound-player"

const GUEST_SOUND_KEY = "pomoder:sound:v1"

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
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const loadedSourceRef = React.useRef<string | null>(null)
  const lastSavedRef = React.useRef("")

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
    const audio = audioRef.current
    if (!audio) return
    audio.volume = state.volume / 100
    audio.muted = state.muted
  }, [state.muted, state.volume])

  React.useEffect(() => {
    setCompletionAlertsEnabled(state.completionAlerts)
  }, [state.completionAlerts])

  const startPlayback = (reference: SoundReference) => {
    const audio = audioRef.current
    if (!audio) return
    const serialized = serializeSoundReference(reference)
    if (loadedSourceRef.current !== serialized) {
      loadedSourceRef.current = serialized
      audio.src = soundSourceUrl(reference)
    }
    audio.loop = true
    audio.play().catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return
      if (cause instanceof DOMException && cause.name === "NotAllowedError") dispatch({ type: "media-blocked" })
      else if (loadedSourceRef.current === serialized) {
        loadedSourceRef.current = null
        dispatch({ type: "media-error" })
      }
    })
  }

  const stopAudioElement = () => {
    const audio = audioRef.current
    loadedSourceRef.current = null
    if (!audio) return
    audio.pause()
    audio.removeAttribute("src")
    audio.load()
  }

  const selectSound = (reference: SoundReference, label: string) => {
    if (sameSoundReference(state.selected, reference) && state.status === "playing") {
      audioRef.current?.pause()
      return
    }
    if (state.status === "error") audioRef.current?.load()
    dispatch({ type: "select", reference, label })
    startPlayback(reference)
  }

  const togglePlayback = () => {
    if (!state.selected) return
    if (state.status === "playing") {
      audioRef.current?.pause()
      return
    }
    if (state.status === "error") audioRef.current?.load()
    dispatch({ type: "select", reference: state.selected, label: state.label ?? labelForReference(state.selected) ?? "" })
    startPlayback(state.selected)
  }

  const clearSound = () => {
    stopAudioElement()
    dispatch({ type: "clear" })
  }

  const setVolume = (volume: number) => dispatch({ type: "set-volume", volume })
  const toggleMuted = () => dispatch({ type: "set-muted", muted: !state.muted })
  const setCompletionAlerts = (enabled: boolean) => dispatch({ type: "set-completion-alerts", enabled })

  const markMediaUnavailable = (mediaId: string) => {
    if (state.selected?.type !== "media" || state.selected.mediaId !== mediaId) return
    stopAudioElement()
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
  }

  return (
    <SoundPlayerContext.Provider value={value}>
      {/* The element lives at the shell level so playback survives route changes. */}
      <audio
        ref={audioRef}
        hidden
        preload="none"
        onPlaying={() => dispatch({ type: "media-playing" })}
        onPause={() => dispatch({ type: "media-paused" })}
        onWaiting={() => dispatch({ type: "media-waiting" })}
        onStalled={() => dispatch({ type: "media-waiting" })}
        onError={() => {
          if (!loadedSourceRef.current) return
          loadedSourceRef.current = null
          dispatch({ type: "media-error" })
        }}
      />
      {children}
    </SoundPlayerContext.Provider>
  )
}

export function HeaderSoundPlayer() {
  const player = useSoundPlayer()
  const { state } = player
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
        </>
      ) : null}
      <button onClick={player.clearSound} aria-label="Stop sound">
        <X aria-hidden="true" />
      </button>
      {state.notice ? <small className="player-notice" role="status">{state.notice}</small> : null}
    </div>
  )
}
