import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  formatRunAtForTimezoneInput,
  getNextAutomationRunAt,
  parseAutomationSchedule,
  runAtFromTimezoneInput,
  validateAutomationSchedule,
} from './schedule'

describe('automation schedules', () => {
  it('finds the next daily run in the configured timezone', () => {
    const next = getNextAutomationRunAt(
      { frequency: 'daily', time: '09:00', timezone: 'America/Toronto' },
      new Date('2026-07-15T12:00:00.000Z')
    )
    assert.equal(next?.toISOString(), '2026-07-15T13:00:00.000Z')
  })

  it('clamps monthly schedules to the last day of shorter months', () => {
    const next = getNextAutomationRunAt(
      { frequency: 'monthly', time: '10:00', timezone: 'UTC', dayOfMonth: 31 },
      new Date('2026-04-01T00:00:00.000Z')
    )
    assert.equal(next?.toISOString(), '2026-04-30T10:00:00.000Z')
  })

  it('returns null for a completed one-time schedule', () => {
    const next = getNextAutomationRunAt(
      { frequency: 'once', runAt: '2026-07-15T12:00:00.000Z', timezone: 'UTC' },
      new Date('2026-07-15T13:00:00.000Z')
    )
    assert.equal(next, null)
  })

  it('converts one-time input using the selected timezone', () => {
    const runAt = runAtFromTimezoneInput('2026-07-15T09:00', 'America/Toronto')
    assert.equal(runAt, '2026-07-15T13:00:00.000Z')
    assert.equal(formatRunAtForTimezoneInput(runAt!, 'America/Toronto'), '2026-07-15T09:00')
  })

  it('parses incomplete drafts but reports semantic validation errors', () => {
    const parsed = parseAutomationSchedule({ frequency: 'daily', time: '', timezone: '' })
    assert.match(validateAutomationSchedule(parsed) ?? '', /timezone/)
  })
})
