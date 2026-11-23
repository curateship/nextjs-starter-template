import { clampSoundVolume, type SoundReference } from "@/lib/sound-catalog"

export type SoundPlayerStatus = "idle" | "loading" | "playing" | "paused" | "blocked" | "error"

export type SoundPlayerState = {
  selected: SoundReference | null
  label: string | null
  status: SoundPlayerStatus
  volume: number
  muted: boolean
  completionAlerts: boolean
  notice: string | null
}

export type SoundPlayerEvent =
  | { type: "hydrate"; selected: SoundReference | null; label: string | null; volume: number; muted: boolean; completionAlerts: boolean }
  | { type: "select"; reference: SoundReference; label: string }
  | { type: "clear" }
  | { type: "media-playing" }
  | { type: "media-paused" }
  | { type: "media-waiting" }
  | { type: "media-blocked" }
  | { type: "media-error" }
  | { type: "media-unavailable" }
  | { type: "set-volume"; volume: number }
  | { type: "set-muted"; muted: boolean }
  | { type: "set-completion-alerts"; enabled: boolean }
  | { type: "resolve-label"; label: string }

export const MEDIA_UNAVAILABLE_NOTICE = "That sound is no longer available, so playback stopped."
export const PLAYBACK_BLOCKED_NOTICE = "Your browser paused the sound. Press play to resume."
export const PLAYBACK_FAILED_NOTICE = "This sound could not be loaded. Press play to try again."

export const initialSoundPlayerState: SoundPlayerState = {
  selected: null,
  label: null,
  status: "idle",
  volume: clampSoundVolume(undefined),
  muted: false,
  completionAlerts: false,
  notice: null,
}

const cleared = { selected: null, label: null, status: "idle" as const }

export function soundPlayerReducer(state: SoundPlayerState, event: SoundPlayerEvent): SoundPlayerState {
  switch (event.type) {
    case "hydrate":
      return {
        selected: event.selected,
        label: event.label,
        status: event.selected ? "paused" : "idle",
        volume: clampSoundVolume(event.volume),
        muted: event.muted === true,
        completionAlerts: event.completionAlerts === true,
        notice: null,
      }
    case "select":
      return { ...state, selected: event.reference, label: event.label, status: "loading", notice: null }
    case "clear":
      return { ...state, ...cleared, notice: null }
    case "media-playing":
      return state.selected ? { ...state, status: "playing", notice: null } : state
    case "media-paused":
      return state.selected && ["playing", "loading"].includes(state.status) ? { ...state, status: "paused" } : state
    case "media-waiting":
      return state.selected && state.status === "playing" ? { ...state, status: "loading" } : state
    case "media-blocked":
      return state.selected ? { ...state, status: "blocked", notice: PLAYBACK_BLOCKED_NOTICE } : state
    case "media-error":
      if (!state.selected) return state
      if (state.selected.type === "media") return { ...state, ...cleared, notice: MEDIA_UNAVAILABLE_NOTICE }
      return { ...state, status: "error", notice: PLAYBACK_FAILED_NOTICE }
    case "media-unavailable":
      return state.selected?.type === "media" ? { ...state, ...cleared, notice: MEDIA_UNAVAILABLE_NOTICE } : state
    case "set-volume":
      return { ...state, volume: clampSoundVolume(event.volume) }
    case "set-muted":
      return { ...state, muted: event.muted }
    case "set-completion-alerts":
      return { ...state, completionAlerts: event.enabled }
    case "resolve-label":
      return state.selected && state.label !== event.label ? { ...state, label: event.label } : state
  }
}
