import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  RECOVERY_DELAY_HOURS,
  RECOVERY_MAX_AGE_DAYS,
  buildRecoveryCheckoutPath,
  isRecoveryEnabled,
  recoverySkipReason,
  type RecoveryCandidate,
} from './checkout-recovery-core'

const NOW = new Date('2026-07-31T12:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000

function candidate(overrides: Partial<RecoveryCandidate> = {}): RecoveryCandidate {
  return {
    // Two days old: comfortably inside the send window.
    createdAt: new Date(NOW.getTime() - 48 * HOUR_MS),
    recoveryEmailSentAt: null,
    hasCompletedPurchase: false,
    contactStatus: null,
    recoveryEnabled: true,
    ...overrides,
  }
}

describe('recoverySkipReason', () => {
  it('sends for an abandoned checkout inside the window', () => {
    assert.equal(recoverySkipReason(candidate(), NOW), null)
  })

  it('skips a checkout newer than the delay', () => {
    const justStarted = candidate({ createdAt: new Date(NOW.getTime() - 2 * HOUR_MS) })
    assert.equal(recoverySkipReason(justStarted, NOW), 'too_recent')
  })

  it('sends exactly at the delay boundary', () => {
    const atBoundary = candidate({ createdAt: new Date(NOW.getTime() - RECOVERY_DELAY_HOURS * HOUR_MS) })
    assert.equal(recoverySkipReason(atBoundary, NOW), null)
  })

  it('skips a checkout older than the maximum age', () => {
    const ancient = candidate({
      createdAt: new Date(NOW.getTime() - (RECOVERY_MAX_AGE_DAYS * 24 + 1) * HOUR_MS),
    })
    assert.equal(recoverySkipReason(ancient, NOW), 'too_old')
  })

  it('never emails the same checkout twice', () => {
    const alreadySent = candidate({ recoveryEmailSentAt: new Date(NOW.getTime() - HOUR_MS) })
    assert.equal(recoverySkipReason(alreadySent, NOW), 'already_emailed')
  })

  it('skips someone who completed the purchase since abandoning', () => {
    const bought = candidate({ hasCompletedPurchase: true })
    assert.equal(recoverySkipReason(bought, NOW), 'completed_since')
  })

  it('skips unsubscribed, bounced and complained contacts', () => {
    for (const status of ['unsubscribed', 'bounced', 'complained']) {
      assert.equal(recoverySkipReason(candidate({ contactStatus: status }), NOW), 'suppressed')
    }
  })

  it('still sends to active and cold contacts', () => {
    for (const status of ['active', 'cold']) {
      assert.equal(recoverySkipReason(candidate({ contactStatus: status }), NOW), null)
    }
  })

  it('sends nothing when the site switch is off', () => {
    assert.equal(recoverySkipReason(candidate({ recoveryEnabled: false }), NOW), 'disabled')
  })
})

describe('isRecoveryEnabled', () => {
  it('is on by default and off only when explicitly false', () => {
    assert.equal(isRecoveryEnabled(undefined), true)
    assert.equal(isRecoveryEnabled({}), true)
    assert.equal(isRecoveryEnabled({ checkout_recovery_enabled: true }), true)
    assert.equal(isRecoveryEnabled({ checkout_recovery_enabled: false }), false)
  })
})

describe('buildRecoveryCheckoutPath', () => {
  it('links straight back to the checkout when the tier is known', () => {
    assert.equal(buildRecoveryCheckoutPath('my-course', 'tier-1'), '/products/my-course/checkout?tier=tier-1')
  })

  it('falls back to the product page without a tier', () => {
    assert.equal(buildRecoveryCheckoutPath('my-course', null), '/products/my-course')
    assert.equal(buildRecoveryCheckoutPath('my-course', undefined), '/products/my-course')
  })

  it('escapes tier ids safely', () => {
    assert.equal(
      buildRecoveryCheckoutPath('my-course', 'a b&c'),
      '/products/my-course/checkout?tier=a%20b%26c',
    )
  })
})
