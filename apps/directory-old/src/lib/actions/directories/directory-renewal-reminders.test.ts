import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  daysUntil,
  pendingReminderBucket,
  reminderBucketFor,
  REMINDER_WINDOW_DAYS,
} from './directory-renewal-reminders'

const NOW = new Date('2026-07-16T10:00:00.000Z')

function inDays(days: number) {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000)
}

describe('daysUntil', () => {
  it('rounds up partial days so <24h to expiry counts as 1', () => {
    assert.equal(daysUntil(inDays(0.4), NOW), 1)
    assert.equal(daysUntil(inDays(6.1), NOW), 7)
  })

  it('is negative once expired', () => {
    assert.ok(daysUntil(inDays(-1), NOW) <= 0)
  })
})

describe('reminderBucketFor', () => {
  it('picks the smallest threshold whose window contains the placement', () => {
    assert.equal(reminderBucketFor(7), 7)
    assert.equal(reminderBucketFor(6), 7)
    assert.equal(reminderBucketFor(1), 1)
    assert.equal(reminderBucketFor(0), 1)
  })

  it('returns null outside every window', () => {
    assert.equal(reminderBucketFor(8), null)
    assert.equal(reminderBucketFor(REMINDER_WINDOW_DAYS + 1), null)
  })
})

describe('pendingReminderBucket', () => {
  it('fires the 7-day bucket once, then not again while still in that window', () => {
    assert.equal(pendingReminderBucket(7, null), 7)
    assert.equal(pendingReminderBucket(6, 7), null)
    assert.equal(pendingReminderBucket(2, 7), null)
  })

  it('escalates to the 1-day bucket after the 7-day one was sent', () => {
    assert.equal(pendingReminderBucket(1, 7), 1)
    assert.equal(pendingReminderBucket(0, 1), null)
  })

  it('sends only the urgent bucket when the wider window was missed', () => {
    // Cron first sees the placement at 1 day left having never reminded.
    assert.equal(pendingReminderBucket(1, null), 1)
  })

  it('never fires outside any threshold window', () => {
    assert.equal(pendingReminderBucket(30, null), null)
  })
})
