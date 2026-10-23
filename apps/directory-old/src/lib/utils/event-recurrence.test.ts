import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  addDays,
  describeRecurrence,
  nextMatchingDate,
  nthWeekdayOfMonth,
  parseRecurrenceRule,
  weekdayOf,
  type RecurrenceRule,
} from './event-recurrence'

// Walk the rule forward `n` times the way generateForAnchor does.
function nextN(rule: RecurrenceRule, from: string, n: number): string[] {
  const out: string[] = []
  let cursor = from
  for (let i = 0; i < n; i++) {
    const next = nextMatchingDate(rule, cursor)
    if (!next) break
    out.push(next)
    cursor = next
  }
  return out
}

describe('date helpers', () => {
  it('reads the weekday of a date (0=Sun..6=Sat)', () => {
    assert.equal(weekdayOf('2026-07-28'), 2) // Tuesday
    assert.equal(weekdayOf('2026-08-07'), 5) // Friday
    assert.equal(weekdayOf('not-a-date'), null)
  })

  it('adds and subtracts days across month/year boundaries', () => {
    assert.equal(addDays('2026-07-31', 1), '2026-08-01')
    assert.equal(addDays('2026-01-01', -1), '2025-12-31')
  })

  it('finds the nth weekday of a month, and the last one', () => {
    assert.equal(nthWeekdayOfMonth(2026, 8, 1, 5), '2026-08-07') // first Friday
    assert.equal(nthWeekdayOfMonth(2026, 7, -1, 1), '2026-07-27') // last Monday
    assert.equal(nthWeekdayOfMonth(2026, 8, 4, 5), '2026-08-28') // fourth Friday
    assert.equal(nthWeekdayOfMonth(2026, 8, 5 as number, 5), null) // week 5 is not valid
  })
})

describe('nextMatchingDate — weekly', () => {
  it('produces the next Tuesdays after a Saturday', () => {
    assert.deepEqual(
      nextN({ freq: 'weekly', weekdays: [2] }, '2026-07-25', 8),
      ['2026-07-28', '2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25', '2026-09-01', '2026-09-08', '2026-09-15'],
    )
  })

  it('interleaves multiple weekdays (Mon + Wed)', () => {
    assert.deepEqual(
      nextN({ freq: 'weekly', weekdays: [1, 3] }, '2026-07-25', 4),
      ['2026-07-27', '2026-07-29', '2026-08-03', '2026-08-05'],
    )
  })

  it('stops at the end date', () => {
    assert.deepEqual(
      nextN({ freq: 'weekly', weekdays: [2], until: '2026-08-11' }, '2026-07-25', 8),
      ['2026-07-28', '2026-08-04', '2026-08-11'],
    )
  })
})

describe('nextMatchingDate — monthly', () => {
  it('produces the first Friday of each month', () => {
    assert.deepEqual(
      nextN({ freq: 'monthly', week: 1, weekday: 5 }, '2026-07-25', 5),
      ['2026-08-07', '2026-09-04', '2026-10-02', '2026-11-06', '2026-12-04'],
    )
  })

  it('produces the last Monday of each month', () => {
    assert.deepEqual(
      nextN({ freq: 'monthly', week: -1, weekday: 1 }, '2026-07-25', 3),
      ['2026-07-27', '2026-08-31', '2026-09-28'],
    )
  })
})

describe('describeRecurrence', () => {
  it('describes single and multi-day weekly rules', () => {
    assert.equal(describeRecurrence({ freq: 'weekly', weekdays: [2] }), 'Repeats every Tuesday')
    assert.equal(
      describeRecurrence({ freq: 'weekly', weekdays: [1, 3, 5] }),
      'Repeats every Monday, Wednesday and Friday',
    )
  })

  it('describes monthly rules and appends the end date', () => {
    assert.equal(describeRecurrence({ freq: 'monthly', week: 1, weekday: 5 }), 'Repeats on the first Friday of each month')
    assert.equal(
      describeRecurrence({ freq: 'monthly', week: -1, weekday: 1, until: '2026-12-31' }),
      'Repeats on the last Monday of each month, until Dec 31, 2026',
    )
  })
})

describe('parseRecurrenceRule', () => {
  it('accepts, sorts, and de-dupes weekly weekdays', () => {
    assert.deepEqual(parseRecurrenceRule({ freq: 'weekly', weekdays: [3, 1, 3] }), {
      freq: 'weekly',
      weekdays: [1, 3],
      until: null,
    })
  })

  it('rejects invalid rules', () => {
    assert.equal(parseRecurrenceRule({ freq: 'weekly', weekdays: [] }), null)
    assert.equal(parseRecurrenceRule({ freq: 'weekly', weekdays: [9] }), null)
    assert.equal(parseRecurrenceRule({ freq: 'monthly', week: 6, weekday: 2 }), null)
    assert.equal(parseRecurrenceRule({ freq: 'yearly' }), null)
    assert.equal(parseRecurrenceRule(null), null)
  })

  it('keeps a valid end date and drops a malformed one', () => {
    assert.deepEqual(parseRecurrenceRule({ freq: 'monthly', week: -1, weekday: 0, until: '2026-01-01' }), {
      freq: 'monthly',
      week: -1,
      weekday: 0,
      until: '2026-01-01',
    })
    assert.equal((parseRecurrenceRule({ freq: 'weekly', weekdays: [2], until: 'soon' }) as RecurrenceRule).until, null)
  })
})
