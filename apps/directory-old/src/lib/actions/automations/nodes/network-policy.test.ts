import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isBlockedAutomationAddress, isBlockedAutomationHostname } from './network-policy'

describe('automation scraper network policy', () => {
  it('blocks local and private hostnames and addresses', () => {
    assert.equal(isBlockedAutomationHostname('localhost'), true)
    assert.equal(isBlockedAutomationHostname('service.internal.'), true)
    assert.equal(isBlockedAutomationAddress('127.0.0.1'), true)
    assert.equal(isBlockedAutomationAddress('10.20.30.40'), true)
    assert.equal(isBlockedAutomationAddress('169.254.169.254'), true)
    assert.equal(isBlockedAutomationAddress('::1'), true)
    assert.equal(isBlockedAutomationAddress('fd00::1'), true)
    assert.equal(isBlockedAutomationAddress('::ffff:7f00:1'), true)
    assert.equal(isBlockedAutomationAddress('fe90::1'), true)
  })

  it('allows ordinary public addresses', () => {
    assert.equal(isBlockedAutomationHostname('example.com'), false)
    assert.equal(isBlockedAutomationAddress('93.184.216.34'), false)
    assert.equal(isBlockedAutomationAddress('2606:2800:220:1:248:1893:25c8:1946'), false)
  })

  it('rejects malformed addresses', () => {
    assert.equal(isBlockedAutomationAddress('not-an-address'), true)
  })
})
