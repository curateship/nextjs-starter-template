import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSearchHighlightSegments } from './highlight'

describe('buildSearchHighlightSegments', () => {
  it('marks the typed text inside the title, ignoring case', () => {
    assert.deepEqual(buildSearchHighlightSegments('Pizzeria Roma', 'pizz'), [
      { text: 'Pizz', match: true },
      { text: 'eria Roma', match: false },
    ])
  })

  it('marks every typed word', () => {
    assert.deepEqual(buildSearchHighlightSegments('Pizza Week 2026', 'pizza week'), [
      { text: 'Pizza', match: true },
      { text: ' ', match: false },
      { text: 'Week', match: true },
      { text: ' 2026', match: false },
    ])
  })

  it('prefers the longest matching word', () => {
    assert.deepEqual(buildSearchHighlightSegments('Pizzeria', 'pizza pizzeria'), [
      { text: 'Pizzeria', match: true },
    ])
  })

  it('treats regular-expression characters as plain text', () => {
    assert.deepEqual(buildSearchHighlightSegments('Cafe (Downtown)', '(downtown)'), [
      { text: 'Cafe ', match: false },
      { text: '(Downtown)', match: true },
    ])
  })

  it('returns the whole title unmarked when there is nothing to match', () => {
    assert.deepEqual(buildSearchHighlightSegments('Pizzeria Roma', '   '), [
      { text: 'Pizzeria Roma', match: false },
    ])
    assert.deepEqual(buildSearchHighlightSegments('', 'pizza'), [])
  })
})
