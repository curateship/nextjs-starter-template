import { DEFAULT_CHIME, normalizeChime, type ChimeId } from "@/lib/pomodoro/chimes"
import { clampSoundVolume, type SoundReference } from "@/lib/pomodoro/sound-catalog"

export type SoundPlayerStatus = "idle" | "loading" | "playing" | "paused" | "blocked" | "error"

export type SoundPlayerState = {
  selected: SoundReference | null
  label: string | null
  status: SoundPlayerStatus
  volume: number
  muted: boolean
  completionAlerts: boolean
  focusChime: ChimeId
  breakChime: ChimeId
  notice: string | null
}

export type SoundPlayerEvent =
  | { type: "hydrate"; selected: SoundReference | null; label: string | null; volume: number; muted: boolean; completionAlerts: boolean; focusChime?: unknown; breakChime?: unknown }
  | { type: "choose"; reference: SoundReference; label: string }
  | { type: "select"; reference: SoundReference; label: string }
  | { type: "clear" }
  | { type: "pause" }
  | { type: "media-playing" }
  | { type: "media-paused" }
  | { type: "media-waiting" }
  | { type: "media-blocked" }
  | { type: "media-error" }
  | { type: "media-unavailable" }
  | { type: "set-volume"; volume: number }
  | { type: "set-muted"; muted: boolean }
  | { type: "set-completion-alerts"; enabled: boolean }
  | { type: "set-chime"; moment: "focus" | "break"; chime: ChimeId }
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
  focusChime: DEFAULT_CHIME,
  breakChime: DEFAULT_CHIME,
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
        focusChime: normalizeChime(event.focusChime),
        breakChime: normalizeChime(event.breakChime),
        notice: null,
      }
    // Choosing a sound only chooses it. Playing it is the header's play
    // button or the timer starting, never the picking itself.
    case "choose":
      return { ...state, selected: event.reference, label: event.label, status: "paused", notice: null }
    case "select":
      return { ...state, selected: event.reference, label: event.label, status: "loading", notice: null }
    case "clear":
      return { ...state, ...cleared, notice: null }
    // Pause shows at once while the sound fades out behind it. Tyler, 9 Oct
    // 2026: "just remove the delay but keep the fade". The button used to
    // wait for the 1.4s fade to end before saying Play.
    case "pause":
      return state.selected && ["playing", "loading"].includes(state.status) ? { ...state, status: "paused" } : state
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
    case "set-chime":
      return event.moment === "focus"
        ? { ...state, focusChime: event.chime }
        : { ...state, breakChime: event.chime }
    case "resolve-label":
      return state.selected && state.label !== event.label ? { ...state, label: event.label } : state
  }
}
