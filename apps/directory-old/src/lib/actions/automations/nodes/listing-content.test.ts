import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildAutomationListingContent } from './listing-content'

const listing = {
  name: 'Sunrise Cafe',
  address: '175 Bloor St E, Toronto, ON',
  metaDescription: 'A cozy neighborhood cafe.',
  descriptionHtml: '<p>Great coffee.</p><script>alert(1)</script><p onclick="alert(2)">Fresh pastries.</p>',
}

const template = {
  core: { id: 'core', type: 'directory-core', display_order: 0, content: {} },
  body: { id: 'body', type: 'directory-rich-text', display_order: 1, content: {} },
}

describe('automation Listing content', () => {
  it('maps the address into the Core block and sanitizes the description', () => {
    const content = buildAutomationListingContent(template, listing)
    const serialized = JSON.stringify(content)
    assert.match(serialized, /175 Bloor St E/)
    assert.match(serialized, /Great coffee/)
    assert.match(serialized, /Fresh pastries/)
    assert.doesNotMatch(serialized, /script|onclick|alert\(/i)
  })

  it('requires the selected template to contain a Core block', () => {
    assert.throws(() => buildAutomationListingContent({}, listing), /Core block/)
  })

  it('omits the rich-text block when the template has none', () => {
    const content = buildAutomationListingContent(
      { core: { id: 'core', type: 'directory-core', display_order: 0, content: {} } },
      listing
    )
    assert.equal(Object.keys(content).length, 1)
    assert.ok(content.core)
  })
})
