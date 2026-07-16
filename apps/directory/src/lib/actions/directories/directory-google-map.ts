export const DIRECTORY_GOOGLE_MAP_BLOCK_TYPE = "directory-google-map"

export const DIRECTORY_GOOGLE_MAP_DEFAULT_HEIGHT = 320
export const DIRECTORY_GOOGLE_MAP_MIN_HEIGHT = 200
export const DIRECTORY_GOOGLE_MAP_MAX_HEIGHT = 640

export function normalizeDirectoryGoogleMapHeight(value?: unknown): number {
  const numericValue = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : Number.NaN

  if (!Number.isFinite(numericValue)) {
    return DIRECTORY_GOOGLE_MAP_DEFAULT_HEIGHT
  }

  return Math.min(
    DIRECTORY_GOOGLE_MAP_MAX_HEIGHT,
    Math.max(DIRECTORY_GOOGLE_MAP_MIN_HEIGHT, Math.round(numericValue))
  )
}

export function getDirectoryGoogleMapEmbedUrl(locationQuery?: string | null, apiKey?: string | null): string {
  const trimmedLocation = locationQuery?.trim() || ""
  const trimmedApiKey = apiKey?.trim() || ""

  if (!trimmedLocation || !trimmedApiKey) {
    return ""
  }

  const params = new URLSearchParams({
    key: trimmedApiKey,
    q: trimmedLocation,
  })

  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`
}
