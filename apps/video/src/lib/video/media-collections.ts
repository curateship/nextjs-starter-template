/**
 * The browser-safe half of media collections: name rules and the exact
 * sentences both sides show. The database work lives in
 * `src/server/video/media-collections.ts`; this file must stay importable by
 * components, so nothing here may touch the server.
 */

export const MEDIA_COLLECTION_NAME_MAX = 120

export const COLLECTION_NAME_REQUIRED_MESSAGE = "Collection name is required."
export const COLLECTION_NAME_TAKEN_MESSAGE =
  "A collection with that name already exists."
export const COLLECTION_NOT_FOUND_MESSAGE = "Collection not found"

/**
 * Trim, collapse runs of whitespace to one space, refuse emptiness, and cap
 * the length instead of failing the insert. The collapse matters because the
 * unique index compares lowercased names — "B-roll" and "B-roll " must be the
 * same collection, not two.
 */
export function cleanCollectionName(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ")
  if (!cleaned) {
    throw new Error(COLLECTION_NAME_REQUIRED_MESSAGE)
  }
  return cleaned.slice(0, MEDIA_COLLECTION_NAME_MAX)
}
