import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  extractDirectoryAddress,
  parseGeocodeResponse,
  planCoordinateSync,
} from './directory-map-core'

const coreBlock = (address: string) => ({
  'block-1': { type: 'directory-core', content: { title: 'Cafe', address } },
})

describe('extractDirectoryAddress', () => {
  it('reads the core block address', () => {
    assert.equal(extractDirectoryAddress(coreBlock(' 12 Main St, Springfield ')), '12 Main St, Springfield')
  })

  it('falls back to the google-map location query', () => {
    const blocks = {
      a: { type: 'directory-core', content: { address: '' } },
      b: { type: 'directory-google-map', content: { locationQuery: 'Pier 9, Harbor Town' } },
    }
    assert.equal(extractDirectoryAddress(blocks), 'Pier 9, Harbor Town')
  })

  it('prefers the core address over the map query', () => {
    const blocks = {
      a: { type: 'directory-google-map', content: { locationQuery: 'Somewhere else' } },
      b: { type: 'directory-core', content: { address: '1 First Ave' } },
    }
    assert.equal(extractDirectoryAddress(blocks), '1 First Ave')
  })

  it('returns empty for missing, malformed, or address-less blocks', () => {
    assert.equal(extractDirectoryAddress(null), '')
    assert.equal(extractDirectoryAddress('nope'), '')
    assert.equal(extractDirectoryAddress({ a: { type: 'directory-core' } }), '')
    assert.equal(extractDirectoryAddress({ a: { type: 'rich-text', content: { address: 'x' } } }), '')
  })
})

describe('parseGeocodeResponse', () => {
  it('parses a successful response', () => {
    const body = { status: 'OK', results: [{ geometry: { location: { lat: 43.65, lng: -79.38 } } }] }
    assert.deepEqual(parseGeocodeResponse(body), { latitude: 43.65, longitude: -79.38 })
  })

  it('rejects non-OK statuses, empty results, and out-of-range values', () => {
    assert.equal(parseGeocodeResponse({ status: 'ZERO_RESULTS', results: [] }), null)
    assert.equal(parseGeocodeResponse({ status: 'OK', results: [] }), null)
    assert.equal(parseGeocodeResponse({ status: 'OK', results: [{ geometry: { location: { lat: 999, lng: 0 } } }] }), null)
    assert.equal(parseGeocodeResponse({ status: 'OK', results: [{ geometry: { location: { lat: 'x', lng: 0 } } }] }), null)
    assert.equal(parseGeocodeResponse(null), null)
  })
})

describe('planCoordinateSync', () => {
  const geocoded = { latitude: 1, longitude: 2, geocodedAddress: '1 First Ave' }
  const empty = { latitude: null, longitude: null, geocodedAddress: null }

  it('skips when the address is unchanged and coordinates exist', () => {
    assert.deepEqual(planCoordinateSync(geocoded, coreBlock('1 First Ave')), { action: 'skip' })
  })

  it('geocodes when the address changed', () => {
    assert.deepEqual(planCoordinateSync(geocoded, coreBlock('2 Second St')), { action: 'geocode', address: '2 Second St' })
  })

  it('geocodes when coordinates are missing even if the cached address matches', () => {
    const current = { latitude: null, longitude: null, geocodedAddress: '1 First Ave' }
    assert.deepEqual(planCoordinateSync(current, coreBlock('1 First Ave')), { action: 'geocode', address: '1 First Ave' })
  })

  it('clears stale coordinates when the address is removed', () => {
    assert.deepEqual(planCoordinateSync(geocoded, coreBlock('')), { action: 'clear' })
  })

  it('skips when there is no address and nothing stored', () => {
    assert.deepEqual(planCoordinateSync(empty, coreBlock('')), { action: 'skip' })
  })
})
