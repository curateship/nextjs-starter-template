import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { generateGuidedFormContactToken, verifyGuidedFormContactToken } from './guided-form-contact-token'

const siteId = '11111111-1111-4111-8111-111111111111'

describe('guided form contact tokens', () => {
  it('verifies a token for the same site and email', () => {
    process.env.AUTH_SECRET = 'test-guided-form-secret'

    const token = generateGuidedFormContactToken({
      siteId,
      email: 'Person@Example.com',
    })

    assert.deepEqual(verifyGuidedFormContactToken({
      siteId,
      email: 'person@example.com',
      token,
    }), {
      ok: true,
      email: 'person@example.com',
    })
  })

  it('rejects tokens for a different email or site', () => {
    process.env.AUTH_SECRET = 'test-guided-form-secret'

    const token = generateGuidedFormContactToken({
      siteId,
      email: 'person@example.com',
    })

    assert.equal(verifyGuidedFormContactToken({
      siteId,
      email: 'other@example.com',
      token,
    }).ok, false)
    assert.equal(verifyGuidedFormContactToken({
      siteId: '33333333-3333-4333-8333-333333333333',
      email: 'person@example.com',
      token,
    }).ok, false)
  })

  it('rejects tampered token payloads', () => {
    process.env.AUTH_SECRET = 'test-guided-form-secret'

    const token = generateGuidedFormContactToken({
      siteId,
      email: 'person@example.com',
    })
    const [, signature] = token.split('.')
    const tamperedPayload = Buffer.from(JSON.stringify({
      v: 'v1',
      siteId,
      email: 'person@example.com',
      exp: Date.now() + 30 * 60 * 1000,
      extra: true,
    })).toString('base64url')

    assert.equal(verifyGuidedFormContactToken({
      siteId,
      email: 'person@example.com',
      token: `${tamperedPayload}.${signature}`,
    }).ok, false)
  })
})
