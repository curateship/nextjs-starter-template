// Pure helpers for "near me" distance search. No app imports so the server
// action, the client block and the tests can all use them.

import { parseGeocodeResponse } from './directory-map-core'

/** Radii offered in the visitor-facing control, in kilometres. */
export const NEAR_ME_RADII_KM = [5, 10, 25, 50] as const

export const DEFAULT_NEAR_ME_RADIUS_KM = 10

/**
 * Mean Earth radius used by the Haversine formula. Exported because the SQL
 * distance expression in `page-listing-views-actions` must use the same value:
 * if the two drifted, the bounding box would stop being a superset of the
 * circle and listings inside the radius would silently vanish.
 */
export const EARTH_RADIUS_KM = 6371

/**
 * Coordinates are rounded to 3 decimals (~110 m) everywhere before they leave
 * the browser. That is far finer than any radius on offer, and it keeps a
 * visitor's exact position out of the URL, the server logs and the database
 * query.
 */
const COORDINATE_DECIMALS = 3

export interface NearMePoint {
  latitude: number
  longitude: number
}

export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  const lat = Number(latitude)
  const lng = Number(longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function snapCoordinate(value: number): number {
  const factor = 10 ** COORDINATE_DECIMALS
  return Math.round(value * factor) / factor
}

export function snapPoint(point: NearMePoint): NearMePoint {
  return { latitude: snapCoordinate(point.latitude), longitude: snapCoordinate(point.longitude) }
}

function isOfferedRadius(value: number): boolean {
  return NEAR_ME_RADII_KM.includes(value as (typeof NEAR_ME_RADII_KM)[number])
}

/**
 * Clamp an arbitrary radius to one of the offered options, preferring the
 * caller's fallback (a block's configured default) over the global default.
 */
export function normalizeRadiusKm(value: unknown, fallbackKm?: unknown): number {
  const radius = Number(value)
  if (isOfferedRadius(radius)) return radius

  const fallback = Number(fallbackKm)
  return isOfferedRadius(fallback) ? fallback : DEFAULT_NEAR_ME_RADIUS_KM
}

/** Serialize a point for the `near` URL parameter. */
export function formatNearParam(point: NearMePoint): string {
  const snapped = snapPoint(point)
  return `${snapped.latitude},${snapped.longitude}`
}

/** Parse the `near` URL parameter, rejecting anything that is not a real point. */
export function parseNearParam(value: string | null | undefined): NearMePoint | null {
  if (typeof value !== 'string') return null
  const parts = value.split(',')
  if (parts.length !== 2) return null
  const latitude = Number(parts[0])
  const longitude = Number(parts[1])
  if (!isValidCoordinate(latitude, longitude)) return null
  return snapPoint({ latitude, longitude })
}

/**
 * Great-circle distance in kilometres between two points. This is the reference
 * implementation; `getDistanceSelect` in `page-listing-views-actions` is the
 * same formula in SQL, and the bounding-box tests assert against this one.
 */
export function haversineKm(from: NearMePoint, to: NearMePoint): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(to.latitude - from.latitude)
  const deltaLng = toRadians(to.longitude - from.longitude)
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

export interface BoundingBox {
  minLatitude: number
  maxLatitude: number
  minLongitude: number
  maxLongitude: number
  /** True when the box wraps the ±180° meridian, so longitude needs an OR test. */
  wrapsAntimeridian: boolean
}

/**
 * A latitude/longitude box that fully contains the radius circle. Used as an
 * index-friendly prefilter before the exact Haversine test; it is deliberately
 * generous rather than exact.
 */
export function getBoundingBox(point: NearMePoint, radiusKm: number): BoundingBox {
  const latitudeDelta = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI)
  const minLatitude = Math.max(-90, point.latitude - latitudeDelta)
  const maxLatitude = Math.min(90, point.latitude + latitudeDelta)

  // Longitude degrees shrink towards the poles, so the widest longitude span is
  // at the highest latitude the box touches. Using that keeps the box a superset
  // of the circle; near the poles the cosine collapses and the box becomes the
  // whole world, which is correct.
  const highestLatitude = Math.max(Math.abs(minLatitude), Math.abs(maxLatitude))
  const cosine = Math.cos((highestLatitude * Math.PI) / 180)
  if (cosine < 1e-6 || latitudeDelta / cosine >= 180) {
    return { minLatitude, maxLatitude, minLongitude: -180, maxLongitude: 180, wrapsAntimeridian: false }
  }

  const longitudeDelta = latitudeDelta / cosine
  const rawMin = point.longitude - longitudeDelta
  const rawMax = point.longitude + longitudeDelta
  const wrapsAntimeridian = rawMin < -180 || rawMax > 180

  return {
    minLatitude,
    maxLatitude,
    minLongitude: wrapsAntimeridian ? normalizeLongitude(rawMin) : rawMin,
    maxLongitude: wrapsAntimeridian ? normalizeLongitude(rawMax) : rawMax,
    wrapsAntimeridian,
  }
}

function normalizeLongitude(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180
}

/**
 * Distance label for a listing card. Coordinates are snapped to ~110 m, so
 * anything under 100 m is reported as "Nearby" rather than a false precision.
 */
export function formatDistanceKm(distanceKm: number | null | undefined): string {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) return ''
  if (distanceKm < 0.1) return 'Nearby'
  if (distanceKm < 1) return `${Math.round((distanceKm * 1000) / 10) * 10} m away`
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km away`
  return `${Math.round(distanceKm)} km away`
}

export interface GeocodedPlace extends NearMePoint {
  /** Human-readable name of the place, shown back to the visitor. */
  label: string
}

/**
 * Parse a Google Geocoding response for a typed location: the point plus the
 * formatted address to echo back in the control.
 */
export function parseGeocodedPlace(body: unknown, fallbackLabel: string): GeocodedPlace | null {
  const point = parseGeocodeResponse(body)
  if (!point) return null

  const result = (body as { results?: unknown[] }).results?.[0] as { formatted_address?: unknown } | undefined
  const formatted = typeof result?.formatted_address === 'string' ? result.formatted_address.trim() : ''

  return {
    ...snapPoint(point),
    label: (formatted || fallbackLabel).slice(0, 120),
  }
}
