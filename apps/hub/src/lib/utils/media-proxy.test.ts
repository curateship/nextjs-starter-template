import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseR2MediaKey } from './media-proxy'

describe('parseR2MediaKey', () => {
  it('extracts a normal R2 media key', () => {
    assert.deepEqual(parseR2MediaKey('r2://user-id/media/file.webp'), {
      key: 'user-id/media/file.webp',
      error: null,
    })
  })

  it('rejects private automation reference keys', () => {
    const result = parseR2MediaKey('r2://user-id/ai-automation-references/source.pdf')

    assert.equal(result.key, null)
    assert.equal(result.error, 'R2 media key is not public')
  })

  it('rejects malformed keys', () => {
    assert.equal(parseR2MediaKey('r2://').error, 'Invalid R2 media key')
    assert.equal(parseR2MediaKey('r2:///file.png').error, 'Invalid R2 media key')
    assert.equal(parseR2MediaKey('r2://user/../secret.txt').error, 'Invalid R2 media key')
  })
})
