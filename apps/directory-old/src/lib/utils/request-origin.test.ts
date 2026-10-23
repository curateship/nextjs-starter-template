import assert from 'node:assert/strict'
import test from 'node:test'

import {
  directoryInternalOrigin,
  directoryLocalOrigin,
} from '../../test-utils/local-app'
import { isSameOriginRequest } from './request-origin'

test('accepts a matching request origin', () => {
  const request = new Request(`${directoryLocalOrigin}/api/products`, {
    headers: { origin: directoryLocalOrigin },
  })

  assert.equal(isSameOriginRequest(request), true)
})

test('accepts a matching referer when origin is absent', () => {
  const request = new Request(`${directoryLocalOrigin}/api/products`, {
    headers: { referer: `${directoryLocalOrigin}/admin/products` },
  })

  assert.equal(isSameOriginRequest(request), true)
})

test('rejects missing, malformed, and foreign origins', () => {
  assert.equal(
    isSameOriginRequest(new Request(`${directoryLocalOrigin}/api/products`)),
    false,
  )
  assert.equal(
    isSameOriginRequest(new Request(`${directoryLocalOrigin}/api/products`, {
      headers: { origin: 'not a URL' },
    })),
    false,
  )
  assert.equal(
    isSameOriginRequest(new Request(`${directoryLocalOrigin}/api/products`, {
      headers: { origin: 'https://attacker.example' },
    })),
    false,
  )
})

test('uses forwarded origin behind the deployment proxy', () => {
  const request = new Request(`${directoryInternalOrigin}/api/products`, {
    headers: {
      origin: 'https://directory.example',
      'x-forwarded-host': 'directory.example',
      'x-forwarded-proto': 'https',
    },
  })

  assert.equal(isSameOriginRequest(request), true)
})
