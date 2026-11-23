import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildAutomationNewsletterBlocks,
  resolveNewsletterSubject,
} from './newsletter-content'

const article = {
  title: 'This week in town',
  excerpt: 'Safe excerpt',
  metaDescription: 'Safe description',
  html: '<h2>Safe heading</h2><script>alert(1)</script><p onclick="alert(2)">Safe body</p>',
}

function templateWithBody() {
  return {
    header: { id: 'header', type: 'newsletter-header', content: { logoUrl: 'https://cdn.test/logo.png' }, display_order: 0 },
    body: { id: 'body', type: 'newsletter-rich-text', content: { htmlContent: '<p>Old copy</p>', padding: 32 }, display_order: 1 },
    footer: { id: 'footer', type: 'newsletter-footer', content: { companyName: 'Town Guide' }, display_order: 2 },
  }
}

function richTextBlock(blocks: Record<string, any>) {
  return Object.values(blocks).find((block: any) => block.type === 'newsletter-rich-text') as any
}

describe('automation Newsletter content', () => {
  it('fills the template body and leaves the rest of the frame alone', () => {
    const blocks = buildAutomationNewsletterBlocks(templateWithBody(), article)
    assert.deepEqual(Object.keys(blocks).sort(), ['body', 'footer', 'header'])
    const body = richTextBlock(blocks)
    assert.match(body.content.htmlContent, /Safe heading/)
    assert.match(body.content.htmlContent, /Safe body/)
    assert.doesNotMatch(body.content.htmlContent, /Old copy/)
    // The template's own block settings survive, and the block keeps its place.
    assert.equal(body.content.padding, 32)
    assert.equal(body.display_order, 1)
    assert.deepEqual((blocks as any).footer.content, { companyName: 'Town Guide' })
  })

  it('sanitizes the generated HTML before storing it', () => {
    const serialized = JSON.stringify(buildAutomationNewsletterBlocks(templateWithBody(), article))
    assert.doesNotMatch(serialized, /script|onclick|alert\(/i)
  })

  it('creates a single Rich Text block when no template is chosen', () => {
    const blocks = buildAutomationNewsletterBlocks({}, article)
    assert.equal(Object.keys(blocks).length, 1)
    const body = richTextBlock(blocks)
    assert.equal(body.display_order, 0)
    assert.equal(body.content.backgroundColor, '#ffffff')
    assert.match(body.content.htmlContent, /Safe body/)
  })

  it('refuses a template with no Rich Text block instead of inventing one', () => {
    assert.throws(
      () => buildAutomationNewsletterBlocks({
        header: { id: 'header', type: 'newsletter-header', content: {}, display_order: 0 },
      }, article),
      /Rich Text block/
    )
  })

  it('uses the first Rich Text block when a template has several', () => {
    const blocks = buildAutomationNewsletterBlocks({
      second: { id: 'second', type: 'newsletter-rich-text', content: { htmlContent: '<p>Sign off</p>' }, display_order: 5 },
      first: { id: 'first', type: 'newsletter-rich-text', content: { htmlContent: '<p>Intro</p>' }, display_order: 1 },
    }, article)
    assert.match((blocks as any).first.content.htmlContent, /Safe body/)
    assert.equal((blocks as any).second.content.htmlContent, '<p>Sign off</p>')
  })

  it('carries a generated featured image in as the header picture', () => {
    const blocks = buildAutomationNewsletterBlocks({}, {
      ...article,
      featuredImage: 'https://cdn.test/hero.png',
    })
    assert.match(richTextBlock(blocks).content.htmlContent, /^<img src="https:\/\/cdn\.test\/hero\.png" alt="This week in town" \/>/)
  })

  it('drops a featured image that is not a real http URL', () => {
    const blocks = buildAutomationNewsletterBlocks({}, {
      ...article,
      featuredImage: 'javascript:alert(1)',
    })
    assert.doesNotMatch(richTextBlock(blocks).content.htmlContent, /<img|javascript:/i)
  })

  it('fails when the article body is empty after safety checks', () => {
    assert.throws(
      () => buildAutomationNewsletterBlocks({}, { ...article, html: '<script>alert(1)</script>' }),
      /empty after safety checks/
    )
  })
})

describe('automation Newsletter subject line', () => {
  const base = { templateId: null, subjectText: '' } as const

  it("uses the AI's own title by default", () => {
    assert.equal(
      resolveNewsletterSubject({ ...base, subjectMode: 'article' }, article),
      'This week in town'
    )
  })

  it('substitutes {{title}} into a fixed line', () => {
    assert.equal(
      resolveNewsletterSubject(
        { ...base, subjectMode: 'fixed', subjectText: 'Austin Weekly: {{ TITLE }}' },
        article
      ),
      'Austin Weekly: This week in town'
    )
  })

  it('keeps a title containing $ intact instead of reading it as a replacement pattern', () => {
    // `$$` and `$&` are meaningful to String.replace, and a price in a headline is
    // all it takes to hit them.
    assert.equal(
      resolveNewsletterSubject(
        { ...base, subjectMode: 'fixed', subjectText: 'Weekly: {{title}}' },
        { ...article, title: 'Save $$$ at the market' }
      ),
      'Weekly: Save $$$ at the market'
    )
    assert.equal(
      resolveNewsletterSubject(
        { ...base, subjectMode: 'fixed', subjectText: 'Weekly: {{title}}' },
        { ...article, title: 'Deals $& more' }
      ),
      'Weekly: Deals $& more'
    )
  })

  it('keeps a fixed line with no placeholder exactly as written', () => {
    assert.equal(
      resolveNewsletterSubject({ ...base, subjectMode: 'fixed', subjectText: 'Austin Weekly' }, article),
      'Austin Weekly'
    )
  })

  it('trims a subject line to the column width', () => {
    const subject = resolveNewsletterSubject(
      { ...base, subjectMode: 'fixed', subjectText: 'x'.repeat(255) },
      { ...article, title: 'y'.repeat(255) }
    )
    assert.equal(subject.length, 255)
  })

  it('fails rather than drafting a newsletter with no subject line', () => {
    assert.throws(
      () => resolveNewsletterSubject({ ...base, subjectMode: 'fixed', subjectText: '   ' }, article),
      /subject line came out empty/
    )
  })
})
