import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseExternalMediaUrl, parseR2MediaKey } from './media-proxy'

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

describe('parseExternalMediaUrl', () => {
  const env = {
    R2_PUBLIC_URL: 'https://media.example.com/assets',
    R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  }

  it('allows only explicitly configured R2 hosts', () => {
    assert.equal(parseExternalMediaUrl('https://media.example.com/file.webp', env).error, null)
    assert.equal(parseExternalMediaUrl('https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/file.webp', env).error, null)
  })

  it('rejects arbitrary R2 tenants and insecure URLs', () => {
    assert.equal(parseExternalMediaUrl('https://attacker.r2.dev/file.webp', env).error, 'host_not_allowed')
    assert.equal(parseExternalMediaUrl('https://other.r2.cloudflarestorage.com/file.webp', env).error, 'host_not_allowed')
    assert.equal(parseExternalMediaUrl('http://media.example.com/file.webp', env).error, 'invalid_scheme')
    assert.equal(parseExternalMediaUrl('https://user:password@media.example.com/file.webp', env).error, 'invalid_url')
    assert.equal(parseExternalMediaUrl('https://media.example.com:8443/file.webp', env).error, 'invalid_url')
  })
})
