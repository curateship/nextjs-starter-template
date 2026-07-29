import { headers } from '@/lib/request-headers'
import { getGoogleMapsConfig } from '@/lib/actions/integrations/config-helpers'
import { getClientIp, isRateLimited } from '@/lib/utils/rate-limit'
import { UUID_REGEX } from '@/lib/utils/validation'
import { parseGeocodedPlace, type GeocodedPlace } from './directory-near-me-core'

// Typed locations hit Google's paid Geocoding API, so this is capped per visitor
// per site. A person refining "Toronto" to "Toronto, ON" a few times stays well
// inside it; a script does not.
const GEOCODE_MAX_REQUESTS = 15
const GEOCODE_WINDOW_MS = 60_000
const GEOCODE_TIMEOUT_MS = 5000
const MAX_QUERY_LENGTH = 120

export interface NearMeGeocodeResult {
  place: GeocodedPlace | null
  error: string | null
}

/**
 * Geocode a visitor-typed city or postcode into a point for the "near me"
 * filter. Public by design — this is the fallback when the browser refuses to
 * share a location — so it is rate limited and never echoes the site's API key.
 */
export async function geocodeNearMeLocationActionImpl(input: {
  siteId: string
  query: string
}): Promise<NearMeGeocodeResult> {
  const query = typeof input.query === 'string' ? input.query.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH) : ''

  if (!UUID_REGEX.test(input.siteId)) {
    return { place: null, error: 'Valid site ID is required' }
  }
  if (query.length < 2) {
    return { place: null, error: 'Enter a town, city or postcode' }
  }

  try {
    const requestHeaders = await headers()
    const ip = getClientIp(requestHeaders) || 'unknown'
    if (isRateLimited(`near-me-geocode:${input.siteId}:${ip}`, GEOCODE_MAX_REQUESTS, GEOCODE_WINDOW_MS)) {
      return { place: null, error: 'Too many location lookups. Try again in a minute.' }
    }

    const config = await getGoogleMapsConfig(input.siteId)
    if (!config?.apiKey) {
      return { place: null, error: 'Location search is not available on this site' }
    }

    const params = new URLSearchParams({ address: query, key: config.apiKey })
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { place: null, error: 'Could not look up that location. Try again.' }
    }

    const place = parseGeocodedPlace(await response.json(), query)
    if (!place) {
      return { place: null, error: `We couldn't find "${query}". Try a town, city or postcode.` }
    }

    return { place, error: null }
  } catch (error) {
    console.error('geocodeNearMeLocationAction error:', error)
    return { place: null, error: 'Could not look up that location. Try again.' }
  }
}
