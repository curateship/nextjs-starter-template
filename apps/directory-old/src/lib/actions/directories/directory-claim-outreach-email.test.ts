import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveDirectoryContactEmail } from './directory-claim-outreach-email'
import { DIRECTORY_CORE_BLOCK_TYPE } from './directory-core'

function coreBlock(menuLinks: unknown[]) {
  return {
    'block-1': {
      id: 'block-1',
      type: DIRECTORY_CORE_BLOCK_TYPE,
      display_order: 0,
      content: { menuLinks },
    },
  }
}

describe('resolveDirectoryContactEmail', () => {
  it('returns the email from the Core block email menu link', () => {
    const blocks = coreBlock([
      { type: 'phone', value: '+1 555 111 2222' },
      { type: 'email', value: 'Hello@Example.com' },
    ])
    assert.equal(resolveDirectoryContactEmail(blocks), 'hello@example.com')
  })

  it('strips a mailto: prefix and trims/lowercases', () => {
    const blocks = coreBlock([{ type: 'email', value: '  MAILTO:Owner@Biz.CO  ' }])
    assert.equal(resolveDirectoryContactEmail(blocks), 'owner@biz.co')
  })

  it('returns null when the email link value is not a valid email', () => {
    const blocks = coreBlock([{ type: 'email', value: 'not-an-email' }])
    assert.equal(resolveDirectoryContactEmail(blocks), null)
  })

  it('returns null when the Core block has no email link', () => {
    const blocks = coreBlock([{ type: 'website', value: 'example.com' }])
    assert.equal(resolveDirectoryContactEmail(blocks), null)
  })

  it('ignores email links carried by non-Core blocks', () => {
    const blocks = {
      'block-1': {
        id: 'block-1',
        type: 'directory-rich-text',
        content: { menuLinks: [{ type: 'email', value: 'ghost@example.com' }] },
      },
    }
    assert.equal(resolveDirectoryContactEmail(blocks), null)
  })

  it('returns null for missing or malformed content', () => {
    assert.equal(resolveDirectoryContactEmail(null), null)
    assert.equal(resolveDirectoryContactEmail(undefined), null)
    assert.equal(resolveDirectoryContactEmail({}), null)
    assert.equal(resolveDirectoryContactEmail('nope'), null)
  })
})
