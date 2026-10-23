import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveEventSubmissionFields } from './event-submission-fields'

function byKey(config: unknown) {
  return Object.fromEntries(resolveEventSubmissionFields(config).map((field) => [field.key, field]))
}

describe('resolveEventSubmissionFields', () => {
  it('returns every field with defaults when no config is given', () => {
    const fields = resolveEventSubmissionFields(undefined)
    assert.deepEqual(fields.map((field) => field.key), ['eventName', 'dateTimeText', 'location', 'submitterEmail', 'description'])

    const map = byKey(undefined)
    assert.equal(map.eventName.label, 'Event name')
    assert.equal(map.dateTimeText.label, 'When')
    assert.equal(map.description.placeholder, 'Tell us about the event...')
  })

  it('keeps essential fields shown and required no matter what the config says', () => {
    const map = byKey({
      eventName: { show: false, required: false },
      submitterEmail: { show: false, required: false },
    })
    assert.equal(map.eventName.show, true)
    assert.equal(map.eventName.required, true)
    assert.equal(map.submitterEmail.show, true)
    assert.equal(map.submitterEmail.required, true)
  })

  it('lets the owner hide or require the optional fields', () => {
    const map = byKey({
      dateTimeText: { required: true },
      description: { show: false },
    })
    assert.equal(map.dateTimeText.required, true)
    assert.equal(map.dateTimeText.show, true)
    assert.equal(map.description.show, false)
    // Optional fields default to shown-but-not-required.
    assert.equal(map.location.show, true)
    assert.equal(map.location.required, false)
  })

  it('applies label overrides but falls back to the default for a blank label', () => {
    const map = byKey({
      dateTimeText: { label: '  Date & time  ' },
      location: { label: '   ' },
    })
    assert.equal(map.dateTimeText.label, 'Date & time')
    assert.equal(map.location.label, 'Location')
  })

  it('respects an explicitly cleared placeholder but defaults an unset one', () => {
    const map = byKey({ location: { placeholder: '' } })
    assert.equal(map.location.placeholder, '')
    assert.equal(map.dateTimeText.placeholder, 'Sat, Aug 16 · 7:00 PM')
  })

  it('ignores non-object config and non-object per-field overrides', () => {
    assert.equal(byKey(null).eventName.label, 'Event name')
    assert.equal(byKey('nonsense').description.show, true)
    assert.equal(byKey({ location: 'nope' }).location.label, 'Location')
  })

  it('clamps overly long label and placeholder overrides', () => {
    const map = byKey({ dateTimeText: { label: 'x'.repeat(300), placeholder: 'y'.repeat(300) } })
    assert.equal(map.dateTimeText.label.length, 120)
    assert.equal(map.dateTimeText.placeholder.length, 160)
  })
})
