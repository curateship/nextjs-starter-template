import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatCentsAmount, isDirectoryFeaturedNow, sanitizeReturnPath } from './directory-featured-helpers'

describe('sanitizeReturnPath', () => {
  it('keeps a plain same-site path', () => {
    assert.equal(sanitizeReturnPath('/account/my-listings'), '/account/my-listings')
    assert.equal(sanitizeReturnPath('/dashboard/listings'), '/dashboard/listings')
  })

  it('strips query strings and hashes so checkout params stay clean', () => {
    assert.equal(sanitizeReturnPath('/account/my-listings?tab=old'), '/account/my-listings')
    assert.equal(sanitizeReturnPath('/account/my-listings#section'), '/account/my-listings')
  })

  it('rejects paths that could redirect off-site', () => {
    assert.equal(sanitizeReturnPath('https://evil.example.com/phish'), '/account/my-listings')
    assert.equal(sanitizeReturnPath('//evil.example.com'), '/account/my-listings')
    assert.equal(sanitizeReturnPath('/\\evil.example.com'), '/account/my-listings')
    assert.equal(sanitizeReturnPath('account/my-listings'), '/account/my-listings')
  })

  it('falls back for non-string or empty input', () => {
    assert.equal(sanitizeReturnPath(undefined), '/account/my-listings')
    assert.equal(sanitizeReturnPath(null), '/account/my-listings')
    assert.equal(sanitizeReturnPath(42), '/account/my-listings')
    assert.equal(sanitizeReturnPath('   '), '/account/my-listings')
  })

  it('keeps the site root when the block lives on the home page', () => {
    assert.equal(sanitizeReturnPath('/'), '/')
    assert.equal(sanitizeReturnPath('/?only=query'), '/')
  })
})

describe('formatCentsAmount', () => {
  it('formats Stripe minor units with the currency symbol', () => {
    assert.equal(formatCentsAmount(4900, 'usd'), '$49.00')
    assert.equal(formatCentsAmount(0, 'usd'), '$0.00')
  })

  it('returns null when the amount is unknown', () => {
    assert.equal(formatCentsAmount(null, 'usd'), null)
    assert.equal(formatCentsAmount(undefined, 'usd'), null)
  })

  it('falls back to a plain string for unknown currency codes', () => {
    assert.equal(formatCentsAmount(4900, 'nope'), '49.00 nope')
  })
})

describe('isDirectoryFeaturedNow', () => {
  it('is true only while the end date is in the future', () => {
    assert.equal(isDirectoryFeaturedNow(new Date(Date.now() + 60_000).toISOString()), true)
    assert.equal(isDirectoryFeaturedNow(new Date(Date.now() - 60_000).toISOString()), false)
  })

  it('is false for missing values', () => {
    assert.equal(isDirectoryFeaturedNow(null), false)
    assert.equal(isDirectoryFeaturedNow(undefined), false)
    assert.equal(isDirectoryFeaturedNow(''), false)
  })
})
