// Backgrounds mirror the sound catalog: a curated set of built-in scenes plus
// the user's own uploaded/AI media. A selection serializes to `scene:<key>` or
// `media:<uuid>` and is stored in user_preferences.selected_background, exactly
// like selected_sound. Guests keep their choice in localStorage.

export type CuratedBackground = {
  key: string
  label: string
  // Image name for /pomoder/thumbs-<thumb>.png (lofi's thumb is "lofi_girl").
  thumb: string
  descriptor: "video" | "animated" | "static"
  locked: boolean
}

export const curatedBackgrounds: readonly CuratedBackground[] = [
  { key: "lofi", label: "Lofi girl", thumb: "lofi_girl", descriptor: "video", locked: false },
  { key: "ambient", label: "Ambient glow", thumb: "ambient", descriptor: "animated", locked: false },
  { key: "plain", label: "Plain dark", thumb: "plain", descriptor: "static", locked: false },
  { key: "stars", label: "Starry night", thumb: "stars", descriptor: "animated", locked: false },
  { key: "rain", label: "Rainy window", thumb: "rain", descriptor: "video", locked: true },
  { key: "forest", label: "Night forest", thumb: "forest", descriptor: "video", locked: true },
  { key: "ocean", label: "Ocean waves", thumb: "ocean", descriptor: "video", locked: true },
  { key: "fireplace", label: "Fireplace", thumb: "fireplace", descriptor: "video", locked: true },
] as const

export type BackgroundReference =
  | { type: "scene"; key: string }
  // mediaKind is carried on the client so the hero knows whether to render a
  // looping <video> or an <img>; it is not part of the serialized form.
  | { type: "media"; mediaId: string; mediaKind?: "image" | "video" }

// The default scene when nothing is selected, or when a selected upload is
// missing, still processing, or deleted.
export const DEFAULT_BACKGROUND: BackgroundReference = { type: "scene", key: "lofi" }

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function serializeBackgroundReference(reference: BackgroundReference | null) {
  if (!reference) return null
  return reference.type === "scene"
    ? `scene:${reference.key}`
    : `media:${reference.mediaId}`
}

export function parseBackgroundReference(value: unknown): BackgroundReference | null {
  if (typeof value !== "string") return null
  if (value.startsWith("scene:")) {
    const key = value.slice("scene:".length)
    return curatedBackgrounds.some((scene) => scene.key === key)
      ? { type: "scene", key }
      : null
  }
  if (value.startsWith("media:")) {
    const mediaId = value.slice("media:".length)
    return UUID_PATTERN.test(mediaId)
      ? { type: "media", mediaId: mediaId.toLowerCase() }
      : null
  }
  return null
}

export function sameBackgroundReference(
  a: BackgroundReference | null,
  b: BackgroundReference | null
) {
  return serializeBackgroundReference(a) === serializeBackgroundReference(b)
}
