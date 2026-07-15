import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildAutomationPostContent } from './post-content'

const article = {
  title: 'Safe title',
  excerpt: 'Safe excerpt',
  metaDescription: 'Safe description',
  html: '<h2>Safe heading</h2><script>alert(1)</script><p onclick="alert(2)">Safe body</p>',
}

describe('automation Post content', () => {
  it('sanitizes generated HTML before storing template values', () => {
    const content = buildAutomationPostContent({
      core: { id: 'core', type: 'core', display_order: 0, content: {} },
    }, article)
    const serialized = JSON.stringify(content)
    assert.match(serialized, /Safe heading/)
    assert.match(serialized, /Safe body/)
    assert.doesNotMatch(serialized, /script|onclick|alert\(/i)
  })

  it('requires the selected template to contain a Core block', () => {
    assert.throws(() => buildAutomationPostContent({}, article), /Core block/)
  })
})
