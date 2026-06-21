import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getNextAiAutomationRunAt,
  getWeekdayNumber,
  normalizeAiAutomationRecurrence,
} from './schedule'

describe('AI automation schedule helpers', () => {
  it('normalizes invalid recurrence input to safe weekly defaults', () => {
    assert.deepEqual(normalizeAiAutomationRecurrence({ frequency: 'bad', time: '99:99', timezone: 'Bad/Timezone' }), {
      frequency: 'weekly',
      time: '09:00',
      timezone: 'UTC',
      dayOfWeek: 1,
      dayOfMonth: 1,
    })
  })

  it('returns the next daily run after the current time', () => {
    const next = getNextAiAutomationRunAt(
      { frequency: 'daily', time: '09:00', timezone: 'UTC' },
      new Date('2026-06-21T10:00:00.000Z')
    )

    assert.equal(next?.toISOString(), '2026-06-22T09:00:00.000Z')
  })

  it('returns the selected weekly day in the selected timezone', () => {
    const next = getNextAiAutomationRunAt(
      { frequency: 'weekly', time: '08:30', timezone: 'America/Toronto', dayOfWeek: 1 },
      new Date('2026-06-21T12:00:00.000Z')
    )

    assert.equal(getWeekdayNumber(next!, 'America/Toronto'), 1)
    assert.equal(next?.toISOString(), '2026-06-22T12:30:00.000Z')
  })

  it('clamps monthly dates to the end of shorter months', () => {
    const next = getNextAiAutomationRunAt(
      { frequency: 'monthly', time: '09:00', timezone: 'UTC', dayOfMonth: 31 },
      new Date('2026-04-30T12:00:00.000Z')
    )

    assert.equal(next?.toISOString(), '2026-05-31T09:00:00.000Z')
  })
})
