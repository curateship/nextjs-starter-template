// Shared between the collections API layer and its server module, so the
// client can validate a name and recognise a failure without importing the
// database.

export const MEDIA_COLLECTION_NAME_MAX = 120

export const COLLECTION_NAME_TAKEN_MESSAGE =
  "A collection with that name already exists."
export const COLLECTION_NAME_REQUIRED_MESSAGE = "Collection name is required."
export const COLLECTION_NOT_FOUND_MESSAGE = "Collection not found"

// Collapses runs of whitespace so " Logos  " and "Logos" are the same name.
export function cleanCollectionName(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ")
  if (!cleaned) throw new Error(COLLECTION_NAME_REQUIRED_MESSAGE)
  return cleaned.slice(0, MEDIA_COLLECTION_NAME_MAX)
}
