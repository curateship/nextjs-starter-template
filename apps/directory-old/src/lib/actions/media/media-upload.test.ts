import assert from 'node:assert/strict'
import test from 'node:test'

import { prepareMediaBuffer } from './media-content-validation'

test('sanitizes active content from uploaded SVG files', () => {
  const input = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><path d="M0 0h10v10z" /></svg>',
  )
  const output = prepareMediaBuffer('image/svg+xml', input).toString('utf8')

  assert.match(output, /^<svg(?:\s|>)/)
  assert.match(output, /<path/)
  assert.doesNotMatch(output, /script|onload/i)
})

test('rejects external references in uploaded SVG files', () => {
  const input = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://attacker.example/payload.svg#icon" /></svg>',
  )

  assert.throws(
    () => prepareMediaBuffer('image/svg+xml', input),
    /File content does not match/,
  )
})

test('rejects file contents that do not match the declared media type', () => {
  assert.throws(
    () => prepareMediaBuffer('image/png', Buffer.from('not a png')),
    /File content does not match/,
  )
})
