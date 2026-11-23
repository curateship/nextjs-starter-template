import { CATALOG_KEY_PATTERN, findSound, type MediaCatalog } from "@/lib/pomodoro/catalog"
import type { MediaCredit } from "@/lib/pomodoro/shared-media"

// A sound choice: one of the catalogue's sounds, or the member's own upload or
// AI soundscape, serialized as `curated:<key>` or `media:<uuid>`. The sounds
// themselves live in the database and reach a page through the catalogue
// (`catalog.ts`).

export type SoundReference =
  // `url`, `label` and `volume` are filled in from the catalogue when the
  // stored value is read; none of them is part of the serialized form.
  | { type: "curated"; key: string; url?: string; label?: string; volume?: number }
  // `mediaUrl` is the address the server resolved, carried alongside rather
  // than built here; it is not part of the serialized form. `label` is the
  // file's name when it is known, as it is for a file shuffle picked.
  // `credit` names the owner of someone else's shared file (task 03, part 4).
  | {
      type: "media"
      mediaId: string
      mediaUrl?: string
      label?: string
      credit?: MediaCredit | null
    }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function serializeSoundReference(reference: SoundReference | null) {
  if (!reference) return null
  return reference.type === "curated" ? `curated:${reference.key}` : `media:${reference.mediaId}`
}

/**
 * The stored value's shape only. Whether the sound still exists, and is Live,
 * is the catalogue's answer, through `resolveSoundReference`.
 */
export function parseSoundReference(value: unknown): SoundReference | null {
  if (typeof value !== "string") return null
  if (value.startsWith("curated:")) {
    const key = value.slice("curated:".length)
    return CATALOG_KEY_PATTERN.test(key) ? { type: "curated", key } : null
  }
  if (value.startsWith("media:")) {
    const mediaId = value.slice("media:".length)
    return UUID_PATTERN.test(mediaId) ? { type: "media", mediaId: mediaId.toLowerCase() } : null
  }
  return null
}

/**
 * A catalogue sound with its file, name and volume filled in, or null when the
 * catalogue does not have it, which the caller plays as silence. An upload
 * passes through as it is.
 */
export function resolveSoundReference(
  catalog: MediaCatalog,
  reference: SoundReference | null
): SoundReference | null {
  if (!reference || reference.type === "media") return reference
  const sound = findSound(catalog, reference.key)
  if (!sound) return null
  return {
    type: "curated",
    key: sound.key,
    url: sound.fileUrl,
    label: sound.label,
    volume: sound.volume,
  }
}

export function sameSoundReference(a: SoundReference | null, b: SoundReference | null) {
  return serializeSoundReference(a) === serializeSoundReference(b)
}

/**
 * Where the browser fetches this sound from: the catalogue's file, or an
 * upload's address the server resolved. A reference with no address yet has
 * none to give.
 */
export function soundSourceUrl(reference: SoundReference) {
  return reference.type === "curated" ? (reference.url ?? "") : (reference.mediaUrl ?? "")
}

/** The catalogue's volume for this sound, out of 100. An upload plays at full. */
export function soundVolumeScale(reference: SoundReference | null) {
  return reference?.type === "curated" ? (reference.volume ?? 100) / 100 : 1
}

export const DEFAULT_SOUND_VOLUME = 70

export function clampSoundVolume(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SOUND_VOLUME
  return Math.min(100, Math.max(0, Math.round(value)))
}
