import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildAutomationEventContent,
  eventDedupeKey,
  normalizeEventDate,
  normalizeEventTime,
} from './event-content'

const event = {
  title: 'Harbourfront Jazz Night',
  date: '2026-08-15',
  time: '19:30',
  venueName: 'The Grand Hall',
  venueAddress: '123 Main Street, Toronto, ON',
  descriptionHtml: '<p>Live trio.</p><script>alert(1)</script><p onclick="alert(2)">Doors at seven.</p>',
}

const template = {
  'event-content-default': {
    id: 'event-content-default',
    type: 'event-content',
    display_order: 0,
    content: { eventContentStyle: 'default' },
  },
}

describe('automation Event content', () => {
  it('maps date, time, and venue into the Core block and sanitizes the description', () => {
    const content = buildAutomationEventContent(template, event)
    const block = content['event-content-default']
    assert.equal(block.content.eventDate, '2026-08-15')
    assert.equal(block.content.eventTime, '19:30')
    assert.equal(block.content.venueName, 'The Grand Hall')
    assert.equal(block.content.venueAddress, '123 Main Street, Toronto, ON')
    const serialized = JSON.stringify(content)
    assert.match(serialized, /Live trio/)
    assert.match(serialized, /Doors at seven/)
    assert.doesNotMatch(serialized, /script|onclick|alert\(/i)
  })

  it('leaves out fields the page did not provide', () => {
    const content = buildAutomationEventContent(template, {
      ...event,
      time: '',
      venueName: '',
      venueAddress: '',
      descriptionHtml: '',
    })
    assert.deepEqual(content['event-content-default'].content, { eventDate: '2026-08-15' })
  })

  it('requires the selected template to contain a Core block', () => {
    assert.throws(() => buildAutomationEventContent({}, event), /Core block/)
  })
})

describe('automation Event date parsing', () => {
  it('accepts a real ISO calendar date', () => {
    assert.equal(normalizeEventDate('2026-08-15'), '2026-08-15')
    assert.equal(normalizeEventDate('  2026-08-15  '), '2026-08-15')
  })

  it('rejects vague, ambiguous, or impossible dates rather than guessing', () => {
    for (const value of ['next Friday', 'Aug 15', '15/08/2026', '2026-8-5', '2026-02-30', '', null, 42]) {
      assert.equal(normalizeEventDate(value), '', `expected ${JSON.stringify(value)} to be rejected`)
    }
  })

  it('accepts only a 24-hour HH:MM start time', () => {
    assert.equal(normalizeEventTime('19:30'), '19:30')
    assert.equal(normalizeEventTime('00:00'), '00:00')
    for (const value of ['7pm', '24:00', '19:60', '9:30', '', undefined]) {
      assert.equal(normalizeEventTime(value), '', `expected ${JSON.stringify(value)} to be rejected`)
    }
  })
})

describe('automation Event dedupe key', () => {
  it('ignores case and spacing so the same event matches across runs', () => {
    assert.equal(
      eventDedupeKey('  Harbourfront   Jazz Night ', '2026-08-15'),
      eventDedupeKey('harbourfront jazz night', '2026-08-15'),
    )
  })

  it('treats the same title on another date as a different event', () => {
    assert.notEqual(
      eventDedupeKey('Jazz Night', '2026-08-15'),
      eventDedupeKey('Jazz Night', '2026-09-15'),
    )
  })
})
