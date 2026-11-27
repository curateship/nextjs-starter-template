import type { SavedViewValues } from "@/lib/saved-views"

/**
 * Saved views on the two media filters: the video editor's Media panel
 * (`editor-media:library`) and the carousel editor's Image panel
 * (`carousel-media:library`), both in the shell's saved views. One person's
 * views show in every project or carousel, because the files and collections
 * they point at are that person's. A view keeps the Type row and the
 * Collection row; the defaults (every type, and All media or This carousel)
 * stay out.
 */

export const MEDIA_TYPES = ["video", "image", "audio"] as const
export type MediaType = (typeof MEDIA_TYPES)[number]

export const mediaTypeLabels: Record<MediaType, string> = {
  video: "Video",
  image: "Image",
  audio: "Sound",
}

/** The one record every media view is kept on: the person's own library. */
export const MEDIA_SAVED_VIEW_RECORD = "library"

export type MediaFilterKind = {
  /** The saved-view kind. */
  kind: string
  /** The Type row's buttons, in order. */
  types: readonly MediaType[]
  /** The Collection row picked when nothing is filtered. */
  defaultCollection: string
}

export const EDITOR_MEDIA_FILTER: MediaFilterKind = {
  kind: "editor-media",
  types: MEDIA_TYPES,
  defaultCollection: "all",
}

/** Sound never goes on a slide, so the Image panel has no Sound button. */
export const CAROUSEL_MEDIA_FILTER: MediaFilterKind = {
  kind: "carousel-media",
  types: ["video", "image"],
  defaultCollection: "shelf",
}

/** What a media filter menu has picked. */
export type MediaFilterValue = {
  /** Ticked types in the Type row's order; none ticked shows every type. */
  types: MediaType[]
  /** The default ("all" or "shelf"), "uncollected", or a collection's id. */
  collection: string
}

export function emptyMediaFilter(kind: MediaFilterKind): MediaFilterValue {
  return { types: [], collection: kind.defaultCollection }
}

export type MediaViewFilters = {
  /** "video,audio": the ticked types, in the Type row's order. */
  types?: string
  /** "uncollected" or a collection's id. */
  collection?: string
}

/** The ticked types in the Type row's order, unknown ones dropped. */
export function readMediaTypes(
  value: unknown,
  allowed: readonly MediaType[] = MEDIA_TYPES
): MediaType[] {
  if (typeof value !== "string") return []
  const given = new Set(value.split(","))
  return allowed.filter((type) => given.has(type))
}

/** The values a view keeps out of the ones given. */
export function mediaViewFilters(
  values: SavedViewValues,
  kind: MediaFilterKind = EDITOR_MEDIA_FILTER
): MediaViewFilters {
  const kept: MediaViewFilters = {}
  const types = readMediaTypes(values.types, kind.types)
  // Every type ticked shows the same as none ticked.
  if (types.length && types.length < kind.types.length) {
    kept.types = types.join(",")
  }
  const collection =
    typeof values.collection === "string" ? values.collection.trim() : ""
  // "all" and "shelf" are the two defaults, and "Uncollected" is only a row
  // in the video editor.
  if (
    collection !== "all" &&
    collection !== "shelf" &&
    (collection !== "uncollected" || kind === EDITOR_MEDIA_FILTER) &&
    /^[\w-]{1,36}$/.test(collection)
  ) {
    kept.collection = collection
  }
  return kept
}

/** `Video, Sound · B-roll` */
export function describeMediaView(
  filters: MediaViewFilters,
  collectionName: (id: string) => string | undefined
) {
  const parts: string[] = []
  const types = readMediaTypes(filters.types)
  if (types.length) parts.push(types.map((type) => mediaTypeLabels[type]).join(", "))
  if (filters.collection === "uncollected") parts.push("Uncollected")
  else if (filters.collection) {
    parts.push(collectionName(filters.collection) ?? "A deleted collection")
  }
  return parts.join(" · ")
}
