// Pure helpers for the directory map feature. No app imports so both server
// actions and client components (and tests) can use them.

// Map mode plots the current filtered result set; getListingViewsData caps limits at 100,
// so map mode fetches up to this many listings and surfaces a note when more exist.
export const DIRECTORY_MAP_LISTING_LIMIT = 100

const CORE_BLOCK_TYPE = 'directory-core'
const GOOGLE_MAP_BLOCK_TYPE = 'directory-google-map'

function getBlockContentText(block: unknown, type: string, field: string): string {
  if (!block || typeof block !== 'object') return ''
  const candidate = block as { type?: unknown; content?: unknown }
  if (candidate.type !== type) return ''
  const content = candidate.content
  if (!content || typeof content !== 'object') return ''
  const value = (content as Record<string, unknown>)[field]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Extract the geocodable address from a listing's value blocks: the core block
 * address first (what listing cards show), falling back to the Google-map
 * block's location query.
 */
export function extractDirectoryAddress(contentBlocks: unknown): string {
  if (!contentBlocks || typeof contentBlocks !== 'object') return ''
  const blocks = Object.values(contentBlocks as Record<string, unknown>)

  for (const block of blocks) {
    const address = getBlockContentText(block, CORE_BLOCK_TYPE, 'address')
    if (address) return address
  }
  for (const block of blocks) {
    const locationQuery = getBlockContentText(block, GOOGLE_MAP_BLOCK_TYPE, 'locationQuery')
    if (locationQuery) return locationQuery
  }
  return ''
}

export interface GeocodedPoint {
  latitude: number
  longitude: number
}

/** Parse a Google Geocoding API response body into a point, or null. */
export function parseGeocodeResponse(body: unknown): GeocodedPoint | null {
  if (!body || typeof body !== 'object') return null
  const response = body as { status?: unknown; results?: unknown }
  if (response.status !== 'OK' || !Array.isArray(response.results)) return null
  const location = (response.results[0] as { geometry?: { location?: { lat?: unknown; lng?: unknown } } } | undefined)
    ?.geometry?.location
  const latitude = Number(location?.lat)
  const longitude = Number(location?.lng)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { latitude, longitude }
}

export interface DirectoryCoordinateState {
  latitude: number | null
  longitude: number | null
  geocodedAddress: string | null
}

/**
 * Decide what a save should do about coordinates, before any network call:
 * - 'skip'    — address unchanged (or coordinates already absent for an empty address)
 * - 'clear'   — address removed, stale coordinates must be nulled
 * - 'geocode' — address added or changed, needs geocoding
 */
export function planCoordinateSync(current: DirectoryCoordinateState, contentBlocks: unknown):
  | { action: 'skip' }
  | { action: 'clear' }
  | { action: 'geocode'; address: string } {
  const address = extractDirectoryAddress(contentBlocks)
  if (!address) {
    return current.geocodedAddress || current.latitude != null || current.longitude != null
      ? { action: 'clear' }
      : { action: 'skip' }
  }
  if (address === current.geocodedAddress && current.latitude != null && current.longitude != null) {
    return { action: 'skip' }
  }
  return { action: 'geocode', address }
}
