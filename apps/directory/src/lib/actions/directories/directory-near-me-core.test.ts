import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_NEAR_ME_RADIUS_KM,
  formatDistanceKm,
  formatNearParam,
  getBoundingBox,
  haversineKm,
  normalizeRadiusKm,
  parseGeocodedPlace,
  parseNearParam,
  snapPoint,
} from './directory-near-me-core'

const toronto = { latitude: 43.6532, longitude: -79.3832 }
const mississauga = { latitude: 43.589, longitude: -79.6441 }

describe('haversineKm', () => {
  it('measures a known city-to-city distance', () => {
    // Toronto to Mississauga is ~22 km as the crow flies.
    const distance = haversineKm(toronto, mississauga)
    assert.ok(distance > 21 && distance < 23, `expected ~22 km, got ${distance}`)
  })

  it('is zero for the same point and symmetric', () => {
    assert.equal(haversineKm(toronto, toronto), 0)
    assert.equal(
      haversineKm(toronto, mississauga).toFixed(6),
      haversineKm(mississauga, toronto).toFixed(6)
    )
  })

  it('handles points either side of the antimeridian', () => {
    const distance = haversineKm({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 })
    assert.ok(distance < 30, `expected a short hop across the date line, got ${distance}`)
  })
})

describe('getBoundingBox', () => {
  it('contains every point inside the radius', () => {
    const box = getBoundingBox(toronto, 10)
    const inside = { latitude: toronto.latitude + 0.05, longitude: toronto.longitude + 0.06 }
    assert.ok(haversineKm(toronto, inside) < 10)
    assert.ok(inside.latitude >= box.minLatitude && inside.latitude <= box.maxLatitude)
    assert.ok(inside.longitude >= box.minLongitude && inside.longitude <= box.maxLongitude)
    assert.equal(box.wrapsAntimeridian, false)
  })

  it('excludes points well outside the radius', () => {
    const box = getBoundingBox(toronto, 5)
    assert.ok(mississauga.longitude < box.minLongitude)
  })

  it('flags a box that crosses the date line', () => {
    const box = getBoundingBox({ latitude: 0, longitude: 179.99 }, 25)
    assert.equal(box.wrapsAntimeridian, true)
    assert.ok(box.minLongitude > 0 && box.maxLongitude < 0)
  })

  it('falls back to every longitude near the poles', () => {
    const box = getBoundingBox({ latitude: 89.9, longitude: 10 }, 50)
    assert.equal(box.minLongitude, -180)
    assert.equal(box.maxLongitude, 180)
  })
})

describe('parseNearParam', () => {
  it('parses and snaps a valid pair', () => {
    assert.deepEqual(parseNearParam('43.65321,-79.38318'), { latitude: 43.653, longitude: -79.383 })
  })

  it('rejects malformed, partial and out-of-range values', () => {
    assert.equal(parseNearParam(null), null)
    assert.equal(parseNearParam(''), null)
    assert.equal(parseNearParam('43.65'), null)
    assert.equal(parseNearParam('43.65,-79.38,5'), null)
    assert.equal(parseNearParam('abc,def'), null)
    assert.equal(parseNearParam('95,10'), null)
    assert.equal(parseNearParam('10,181'), null)
  })

  it('round-trips through formatNearParam', () => {
    assert.deepEqual(parseNearParam(formatNearParam(toronto)), snapPoint(toronto))
  })
})

describe('normalizeRadiusKm', () => {
  it('keeps offered radii and rejects anything else', () => {
    assert.equal(normalizeRadiusKm(25), 25)
    assert.equal(normalizeRadiusKm('5'), 5)
    assert.equal(normalizeRadiusKm(7), DEFAULT_NEAR_ME_RADIUS_KM)
    assert.equal(normalizeRadiusKm(-1), DEFAULT_NEAR_ME_RADIUS_KM)
    assert.equal(normalizeRadiusKm(undefined), DEFAULT_NEAR_ME_RADIUS_KM)
    assert.equal(normalizeRadiusKm('1e9'), DEFAULT_NEAR_ME_RADIUS_KM)
  })

  it('prefers a valid fallback over the global default', () => {
    assert.equal(normalizeRadiusKm(null, 25), 25)
    assert.equal(normalizeRadiusKm('7', 5), 5)
    assert.equal(normalizeRadiusKm(50, 5), 50)
    assert.equal(normalizeRadiusKm(null, 3), DEFAULT_NEAR_ME_RADIUS_KM)
  })
})

describe('formatDistanceKm', () => {
  it('scales the unit to the distance', () => {
    assert.equal(formatDistanceKm(0), 'Nearby')
    assert.equal(formatDistanceKm(0.42), '420 m away')
    assert.equal(formatDistanceKm(1.24), '1.2 km away')
    assert.equal(formatDistanceKm(23.6), '24 km away')
  })

  it('returns nothing for missing or invalid values', () => {
    assert.equal(formatDistanceKm(null), '')
    assert.equal(formatDistanceKm(undefined), '')
    assert.equal(formatDistanceKm(Number.NaN), '')
    assert.equal(formatDistanceKm(-3), '')
  })
})

describe('parseGeocodedPlace', () => {
  const body = {
    status: 'OK',
    results: [{
      formatted_address: 'Toronto, ON, Canada',
      geometry: { location: { lat: 43.65321, lng: -79.38318 } },
    }],
  }

  it('returns the snapped point and the formatted address', () => {
    assert.deepEqual(parseGeocodedPlace(body, 'toronto'), {
      latitude: 43.653,
      longitude: -79.383,
      label: 'Toronto, ON, Canada',
    })
  })

  it('falls back to what the visitor typed when no address comes back', () => {
    const withoutAddress = { status: 'OK', results: [{ geometry: { location: { lat: 1, lng: 2 } } }] }
    assert.equal(parseGeocodedPlace(withoutAddress, 'somewhere')?.label, 'somewhere')
  })

  it('returns null when the geocode failed', () => {
    assert.equal(parseGeocodedPlace({ status: 'ZERO_RESULTS', results: [] }, 'nowhere'), null)
  })
})
