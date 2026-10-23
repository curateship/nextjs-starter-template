import { enforceRateLimit } from "@/server/auth/rate-limit"
import { requestIp } from "@/server/auth/origin"
import { db, type CustomShellDb } from "@/server/db"
import { directoryGeocodingKey } from "@/server/directory/settings"

export type GeocodedDirectoryPlace = {
  latitude: number
  longitude: number
  label: string
}

type GoogleGeocodingResponse = {
  status?: string
  results?: Array<{
    formatted_address?: string
    geometry?: { location?: { lat?: number; lng?: number } }
  }>
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000
const MAX_CACHE_ENTRIES = 100
const cache = new Map<
  string,
  { expiresAt: number; place: GeocodedDirectoryPlace | null }
>()

/**
 * Google Geocoding is used only for the typed-location fallback. It requires a
 * billing-enabled `GOOGLE_MAPS_GEOCODING_API_KEY`; Google's current standard
 * price is $5 per 1,000 requests after its monthly free allowance.
 */
export async function geocodeDirectoryPlace(
  workspaceId: string,
  query: string
) {
  const normalized = query.replace(/\s+/g, " ").trim().slice(0, 120)
  if (normalized.length < 2) {
    return { place: null, error: "Enter a town, city, or postcode." }
  }

  try {
    await enforceRateLimit(`directory-geocode:${requestIp()}`, {
      maxAttempts: 15,
      windowSeconds: 60,
    })
  } catch (error) {
    return error instanceof Error && error.message === "RATE_LIMITED"
      ? {
          place: null,
          error: "Too many place searches. Try again in a minute.",
        }
      : { place: null, error: "We could not look up that place. Try again." }
  }

  const cacheKey = `${workspaceId}:${normalized.toLocaleLowerCase("en-CA")}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return {
      place: cached.place,
      error: cached.place
        ? null
        : "We could not find that place. Try a town, city, or postcode.",
    }
  }

  const apiKey = await directoryGeocodingKey(workspaceId)
  if (!apiKey) {
    return {
      place: null,
      error:
        "Place search is not available on this site yet. Use your location instead.",
    }
  }

  try {
    const body = await askGoogle(apiKey, normalized)
    const place = parseGeocodedDirectoryPlace(body, normalized)
    while (cache.size >= MAX_CACHE_ENTRIES)
      cache.delete(cache.keys().next().value!)
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, place })
    return {
      place,
      error: place
        ? null
        : "We could not find that place. Try a town, city, or postcode.",
    }
  } catch {
    return { place: null, error: "We could not look up that place. Try again." }
  }
}

/**
 * Google's answer for one address. Throws when Google could not be reached or
 * refused the request; "found nothing" is an answer, not an error.
 */
async function askGoogle(
  apiKey: string,
  address: string
): Promise<GoogleGeocodingResponse> {
  const params = new URLSearchParams({ address, key: apiKey })
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?${params}`,
    { signal: AbortSignal.timeout(5_000) }
  )
  if (!response.ok) throw new Error("Geocoding failed")
  const body = (await response.json()) as GoogleGeocodingResponse
  if (body.status !== "OK" && body.status !== "ZERO_RESULTS") {
    throw new Error("Geocoding provider rejected the request")
  }
  return body
}

/**
 * Where an event's typed street address is, for the map on its page.
 *
 * "not-found" is Google's own answer and is kept, so the same address is not
 * asked about again. "unavailable" is no key, no network or a refusal, which
 * the next save tries again. Kept to six decimal places, about a hand's width,
 * because a pin for a door has to be closer than the browse page's town.
 */
export async function locateAddress(
  workspaceId: string,
  address: string,
  database: CustomShellDb = db
): Promise<
  | { found: true; latitude: number; longitude: number }
  | { found: false; reason: "not-found" | "unavailable" }
> {
  const apiKey = await directoryGeocodingKey(workspaceId, database).catch(
    () => null
  )
  if (!apiKey) return { found: false, reason: "unavailable" }
  let body: GoogleGeocodingResponse
  try {
    body = await askGoogle(apiKey, address.slice(0, 300))
  } catch {
    return { found: false, reason: "unavailable" }
  }
  const location = body.results?.[0]?.geometry?.location
  const latitude = location?.lat
  const longitude = location?.lng
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return { found: false, reason: "not-found" }
  }
  const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000
  return { found: true, latitude: round(latitude), longitude: round(longitude) }
}

/** Turns Google's response into the only public fields the browse page needs. */
export function parseGeocodedDirectoryPlace(
  body: GoogleGeocodingResponse,
  fallbackLabel: string
): GeocodedDirectoryPlace | null {
  const result = body.results?.[0]
  const latitude = result?.geometry?.location?.lat
  const longitude = result?.geometry?.location?.lng
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null
  }

  return {
    latitude: Math.round(latitude * 1_000) / 1_000,
    longitude: Math.round(longitude * 1_000) / 1_000,
    label: (result?.formatted_address?.trim() || fallbackLabel).slice(0, 120),
  }
}
