export type CuratedSound = {
  key: string
  label: string
  description: string
  hint: string
  locked: boolean
}

export const curatedSounds: readonly CuratedSound[] = [
  { key: "lofi", label: "Lofi beats", description: "music", hint: "Mellow hip-hop loops", locked: false },
  { key: "rain", label: "Rain", description: "ambient", hint: "Steady rain on a window", locked: false },
  { key: "cafe", label: "Café ambience", description: "ambient", hint: "Low chatter and cups", locked: false },
  { key: "brown", label: "Brown noise", description: "noise", hint: "Deep steady noise", locked: false },
  { key: "forest", label: "Forest birds", description: "ambient", hint: "Birdsong and soft wind", locked: true },
  { key: "ocean", label: "Ocean waves", description: "ambient", hint: "Slow rolling waves", locked: true },
  { key: "fire", label: "Fireplace", description: "ambient", hint: "Crackling logs", locked: true },
  { key: "piano", label: "Soft piano", description: "music", hint: "Gentle keys and air", locked: true },
] as const

export type SoundReference =
  | { type: "curated"; key: string }
  | { type: "media"; mediaId: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function serializeSoundReference(reference: SoundReference | null) {
  if (!reference) return null
  return reference.type === "curated" ? `curated:${reference.key}` : `media:${reference.mediaId}`
}

export function parseSoundReference(value: unknown): SoundReference | null {
  if (typeof value !== "string") return null
  if (value.startsWith("curated:")) {
    const key = value.slice("curated:".length)
    return curatedSounds.some((sound) => sound.key === key) ? { type: "curated", key } : null
  }
  if (value.startsWith("media:")) {
    const mediaId = value.slice("media:".length)
    return UUID_PATTERN.test(mediaId) ? { type: "media", mediaId: mediaId.toLowerCase() } : null
  }
  return null
}

export function sameSoundReference(a: SoundReference | null, b: SoundReference | null) {
  return serializeSoundReference(a) === serializeSoundReference(b)
}

export function soundSourceUrl(reference: SoundReference) {
  return reference.type === "curated" ? `/pomoder/audio-${reference.key}.mp3` : `/api/media/${reference.mediaId}/file`
}

export const DEFAULT_SOUND_VOLUME = 70

export function clampSoundVolume(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SOUND_VOLUME
  return Math.min(100, Math.max(0, Math.round(value)))
}
