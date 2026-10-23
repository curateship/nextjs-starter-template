import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  resolvePaidPurchaseStatus,
  shouldClaimPaidPurchaseFulfillment,
} from './paid-purchase-state'

describe('paid purchase state', () => {
  it('never downgrades a settled payment', () => {
    assert.equal(resolvePaidPurchaseStatus('succeeded', 'pending'), 'succeeded')
    assert.equal(resolvePaidPurchaseStatus('succeeded', 'failed'), 'succeeded')
  })

  it('allows a delayed payment to settle', () => {
    assert.equal(resolvePaidPurchaseStatus('pending', 'succeeded'), 'succeeded')
  })

  it('claims fulfillment only for undelivered settled orders', () => {
    assert.equal(shouldClaimPaidPurchaseFulfillment('pending', null), false)
    assert.equal(shouldClaimPaidPurchaseFulfillment('succeeded', null), true)
    assert.equal(shouldClaimPaidPurchaseFulfillment('succeeded', new Date()), false)
  })
})
