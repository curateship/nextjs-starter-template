// Server-side geocoding for directory listings. Best-effort by design: a failed
// geocode must never fail the save that triggered it.

import { getGoogleMapsConfig } from '@/lib/actions/integrations/config-helpers'
import {
  parseGeocodeResponse,
  planCoordinateSync,
  type DirectoryCoordinateState,
  type GeocodedPoint,
} from './directory-map-core'

const GEOCODE_TIMEOUT_MS = 5000

export async function geocodeDirectoryAddress(address: string, apiKey: string): Promise<GeocodedPoint | null> {
  try {
    const params = new URLSearchParams({ address, key: apiKey })
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    })
    if (!response.ok) return null
    return parseGeocodeResponse(await response.json())
  } catch {
    return null
  }
}

/**
 * Compute the coordinate column updates a content-blocks save should apply.
 * Returns {} when nothing should change (unchanged address, missing API key,
 * or geocoding failure — failures keep prior coordinates and retry next save).
 */
export async function resolveDirectoryCoordinateUpdates(input: {
  siteId: string
  current: DirectoryCoordinateState
  contentBlocks: Record<string, unknown>
}): Promise<Partial<DirectoryCoordinateState>> {
  try {
    const plan = planCoordinateSync(input.current, input.contentBlocks)
    if (plan.action === 'skip') return {}
    if (plan.action === 'clear') {
      return { latitude: null, longitude: null, geocodedAddress: null }
    }

    const config = await getGoogleMapsConfig(input.siteId)
    if (!config?.apiKey) return {}

    const point = await geocodeDirectoryAddress(plan.address, config.apiKey)
    if (!point) return {}

    return {
      latitude: point.latitude,
      longitude: point.longitude,
      geocodedAddress: plan.address,
    }
  } catch (error) {
    console.error('Directory geocoding failed:', error)
    return {}
  }
}
