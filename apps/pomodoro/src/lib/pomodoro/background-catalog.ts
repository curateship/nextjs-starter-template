import { CATALOG_KEY_PATTERN, findTheme, type MediaCatalog } from "@/lib/pomodoro/catalog"

// A theme choice: one of the catalogue's scenes, or the member's own upload or
// AI background. A selection serializes to `scene:<key>` or `media:<uuid>`,
// stored on the personal room or the hosted room. The scenes themselves live in
// the database and reach a page through the catalogue (`catalog.ts`).

export type BackgroundReference =
  // `stillUrl` and `videoUrl` are filled in from the catalogue when the stored
  // value is read, so the backdrop draws a scene without looking anything up.
  // Neither is part of the serialized form.
  | { type: "scene"; key: string; stillUrl?: string; videoUrl?: string | null }
  // `mediaKind` and `mediaUrl` ride along so the backdrop knows whether to
  // draw a looping <video> or an <img>, and where the file is. Neither is part
  // of the serialized form: the preference stores `media:<uuid>` and the
  // server resolves the address, the way it does for every other file here.
  | {
      type: "media"
      mediaId: string
      mediaKind?: "image" | "video"
      mediaUrl?: string
    }

/**
 * The default scene when nothing is selected, or when a selected item is
 * missing, a Draft, still processing, or deleted. Its files ship with the app
 * rather than coming from the catalogue, so it can always be drawn: it is the
 * last fallback, and a fallback that could itself be missing is not one.
 */
export const DEFAULT_SCENE_FILES = {
  stillUrl: "/backgrounds/thumbs-lofi_girl.png",
  videoUrl: "/backgrounds/uploads-265816_small.mp4",
} as const

export const DEFAULT_BACKGROUND: BackgroundReference = {
  type: "scene",
  key: "lofi",
  ...DEFAULT_SCENE_FILES,
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function serializeBackgroundReference(reference: BackgroundReference | null) {
  if (!reference) return null
  return reference.type === "scene"
    ? `scene:${reference.key}`
    : `media:${reference.mediaId}`
}

/**
 * The stored value's shape only. Whether the scene still exists, and is Live,
 * is the catalogue's answer, through `resolveBackgroundReference`.
 */
export function parseBackgroundReference(value: unknown): BackgroundReference | null {
  if (typeof value !== "string") return null
  if (value.startsWith("scene:")) {
    const key = value.slice("scene:".length)
    return CATALOG_KEY_PATTERN.test(key) ? { type: "scene", key } : null
  }
  if (value.startsWith("media:")) {
    const mediaId = value.slice("media:".length)
    return UUID_PATTERN.test(mediaId)
      ? { type: "media", mediaId: mediaId.toLowerCase() }
      : null
  }
  return null
}

/**
 * A scene with its files filled in from the catalogue, or null when the
 * catalogue does not have it (deleted, a Draft, or never existed), so the
 * caller falls back. An upload passes through as it is.
 */
export function resolveBackgroundReference(
  catalog: MediaCatalog,
  reference: BackgroundReference | null
): BackgroundReference | null {
  if (!reference || reference.type === "media") return reference
  const theme = findTheme(catalog, reference.key)
  if (!theme) return null
  return {
    type: "scene",
    key: theme.key,
    stillUrl: theme.stillUrl,
    videoUrl: theme.videoUrl,
  }
}

export function sameBackgroundReference(
  a: BackgroundReference | null,
  b: BackgroundReference | null
) {
  return serializeBackgroundReference(a) === serializeBackgroundReference(b)
}
