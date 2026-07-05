import { z } from "zod"

// ElevenLabs voice style settings shared by the workspace "voice defaults"
// storage, the voiceover server functions, and the Voice dialog UI. Kept in a
// dependency-free module so the node test runner can import it directly.

// TTS models the Voice dialog offers. All support the word-level timestamps the
// karaoke captions need. Edit this list to add/remove models (e.g. eleven_v3).
export const VOICE_MODEL_IDS = [
  "eleven_multilingual_v2",
  "eleven_turbo_v2_5",
  "eleven_flash_v2_5",
] as const
export type VoiceModelId = (typeof VOICE_MODEL_IDS)[number]

// Speed is clamped tighter than the raw API allows — extremes degrade quality.
export const VOICE_SPEED_MIN = 0.7
export const VOICE_SPEED_MAX = 1.2

// Request-level voice style sent to ElevenLabs as `voice_settings`.
export const voiceSettingsSchema = z
  .object({
    stability: z.number().min(0).max(1),
    similarityBoost: z.number().min(0).max(1),
    styleExaggeration: z.number().min(0).max(1),
    speed: z.number().min(VOICE_SPEED_MIN).max(VOICE_SPEED_MAX),
    speakerBoost: z.boolean(),
  })
  .strict()
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>

// A saved workspace default: a voice + model + style. `null` in workspace
// settings means "no default saved" (voiceover flows keep their old behavior).
export const voiceDefaultsSchema = voiceSettingsSchema
  .extend({
    voiceId: z.string().min(1).max(64),
    voiceName: z.string().max(255),
    modelId: z.enum(VOICE_MODEL_IDS),
  })
  .strict()
export type VoiceDefaults = z.infer<typeof voiceDefaultsSchema>

// The style subset of saved defaults (strict schemas reject the extra
// voiceId/voiceName/modelId keys, so spreading a VoiceDefaults won't do).
export function pickVoiceSettings(defaults: VoiceDefaults): VoiceSettings {
  const { stability, similarityBoost, styleExaggeration, speed, speakerBoost } =
    defaults
  return { stability, similarityBoost, styleExaggeration, speed, speakerBoost }
}

// JSON body for the ElevenLabs /with-timestamps call. `voice_settings` is
// request-scoped and only present when a style is provided — the stored
// ElevenLabs account voice settings are never edited.
export function voiceoverRequestBody(
  text: string,
  modelId: string,
  voiceSettings?: VoiceSettings
) {
  if (!voiceSettings) return { text, model_id: modelId }
  return {
    text,
    model_id: modelId,
    voice_settings: {
      stability: voiceSettings.stability,
      similarity_boost: voiceSettings.similarityBoost,
      style: voiceSettings.styleExaggeration,
      speed: voiceSettings.speed,
      use_speaker_boost: voiceSettings.speakerBoost,
    },
  }
}

// ElevenLabs' own defaults — used as the style baseline when nothing is saved.
export function createDefaultVoiceSettings(): VoiceSettings {
  return {
    stability: 0.5,
    similarityBoost: 0.75,
    styleExaggeration: 0,
    speed: 1,
    speakerBoost: true,
  }
}
