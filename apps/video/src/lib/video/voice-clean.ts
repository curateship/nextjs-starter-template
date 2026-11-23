/**
 * "Clean up the voice": taking hum, hiss and steady room noise out of a
 * clip's sound at one of three strengths.
 *
 * Two ffmpeg stages do it. `highpass` at 80 cycles a second drops mains hum
 * (50 or 60) and rumble, which sit below any voice. `afftdn` then learns the
 * steady noise as the file plays (`tn=1`) and takes it down by `nr` decibels,
 * treating anything under `nf` as noise.
 *
 * The numbers were measured, not heard: on a test file of a 220-cycle tone
 * over pink noise and a 60-cycle hum, the gap with no tone in it went from
 * -39.7 dB to -46.1 (Light), -49.0 (Medium) and -53.4 (Strong), while the
 * tone moved by 0.6 dB or less. A real voice is not a tone, so Strong is the
 * one to listen to before trusting it (workspace/docs/clean-up-the-voice.md).
 *
 * The export runs the same filter on the clip's sound, and the background
 * worker runs it on the whole file to make the copy the preview plays, so the
 * two sound alike.
 */

export const VOICE_CLEAN_STRENGTHS = ["light", "medium", "strong"] as const
export type VoiceCleanStrength = (typeof VOICE_CLEAN_STRENGTHS)[number]

export const DEFAULT_VOICE_CLEAN: VoiceCleanStrength = "medium"

export const VOICE_CLEAN_OPTIONS: { id: VoiceCleanStrength; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "medium", label: "Medium" },
  { id: "strong", label: "Strong" },
]

const SETTINGS: Record<VoiceCleanStrength, { nr: number; nf: number }> = {
  light: { nr: 12, nf: -40 },
  medium: { nr: 24, nf: -35 },
  strong: { nr: 40, nf: -30 },
}

export function isVoiceCleanStrength(value: unknown): value is VoiceCleanStrength {
  return (
    typeof value === "string" &&
    (VOICE_CLEAN_STRENGTHS as readonly string[]).includes(value)
  )
}

/** The ffmpeg stages for one strength, joined by commas. */
export function voiceCleanFilter(strength: VoiceCleanStrength) {
  const { nr, nf } = SETTINGS[strength]
  return `highpass=f=80,afftdn=nr=${nr}:nf=${nf}:tn=1`
}

/** The key one file's copy at one strength is kept under. */
export function cleanSoundKey(mediaId: string, strength: VoiceCleanStrength) {
  return `${mediaId}:${strength}`
}
