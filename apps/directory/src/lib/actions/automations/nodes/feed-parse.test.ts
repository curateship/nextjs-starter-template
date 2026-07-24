import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseFeed } from './feed-parse'

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Local News</title>
    <link>https://news.example.com</link>
    <item>
      <title>City opens new park</title>
      <link>https://news.example.com/park</link>
      <guid isPermaLink="false">tag:news,2026:city-park</guid>
      <pubDate>Wed, 22 Jul 2026 09:30:00 +0000</pubDate>
      <description><![CDATA[<p>The park has &amp; trails &#38; a pond.</p>]]></description>
      <content:encoded><![CDATA[<p>Full story: the new <strong>riverside park</strong> is open.</p>]]></content:encoded>
    </item>
    <item>
      <title>Council meeting &amp; budget</title>
      <link>/council</link>
      <description>Plain summary with &#233; accent and &#x2014; dash.</description>
      <dc:date>2026-07-21T18:00:00Z</dc:date>
    </item>
  </channel>
</rss>`

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <link href="https://atom.example.com/" rel="alternate"/>
  <entry>
    <title>Atom entry one</title>
    <id>urn:uuid:1225c695-1111-2222-3333-444455556666</id>
    <link rel="self" href="https://atom.example.com/self"/>
    <link href="https://atom.example.com/one" rel="alternate" type="text/html"/>
    <published>2026-07-20T12:00:00Z</published>
    <content type="html">&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</content>
  </entry>
  <entry>
    <title>Atom entry two</title>
    <id>urn:uuid:aaaa</id>
    <link href="rel-path/two"/>
    <summary>Just a summary.</summary>
  </entry>
</feed>`

describe('feed parser', () => {
  it('parses RSS 2.0 items with guid, dates, CDATA, and entities', () => {
    const feed = parseFeed(RSS, 'https://news.example.com/feed.xml')
    assert.equal(feed.format, 'rss')
    assert.equal(feed.title, 'Local News')
    assert.equal(feed.entries.length, 2)

    const [first, second] = feed.entries
    assert.equal(first.title, 'City opens new park')
    assert.equal(first.link, 'https://news.example.com/park')
    assert.equal(first.id, 'tag:news,2026:city-park')
    assert.equal(first.publishedAt, '2026-07-22T09:30:00.000Z')
    // content:encoded wins over description; HTML stripped, entities decoded.
    assert.equal(first.summary, 'Full story: the new riverside park is open.')

    // Relative link resolves against the feed URL; entity-decoded title.
    assert.equal(second.title, 'Council meeting & budget')
    assert.equal(second.link, 'https://news.example.com/council')
    assert.equal(second.summary, 'Plain summary with é accent and — dash.')
    assert.equal(second.publishedAt, '2026-07-21T18:00:00.000Z')
    // No guid and no permalink → identity falls back to the (absolute) link.
    assert.equal(second.id, 'https://news.example.com/council')
  })

  it('parses Atom entries, choosing the alternate link and stripping content HTML', () => {
    const feed = parseFeed(ATOM, 'https://atom.example.com/feed')
    assert.equal(feed.format, 'atom')
    assert.equal(feed.entries.length, 2)

    const [first, second] = feed.entries
    assert.equal(first.title, 'Atom entry one')
    assert.equal(first.id, 'urn:uuid:1225c695-1111-2222-3333-444455556666')
    // Ignores rel="self", takes rel="alternate".
    assert.equal(first.link, 'https://atom.example.com/one')
    assert.equal(first.summary, 'Hello world')
    assert.equal(first.publishedAt, '2026-07-20T12:00:00.000Z')

    // Link without rel defaults to alternate and resolves relative paths.
    assert.equal(second.link, 'https://atom.example.com/rel-path/two')
    assert.equal(second.summary, 'Just a summary.')
    assert.equal(second.publishedAt, null)
  })

  it('returns no entries for a valid but empty feed', () => {
    const feed = parseFeed('<rss version="2.0"><channel><title>Empty</title></channel></rss>', 'https://x.example.com')
    assert.equal(feed.entries.length, 0)
  })

  it('throws a clear error for content that is not a feed', () => {
    assert.throws(() => parseFeed('<html><body>not a feed</body></html>', 'https://x.example.com'), /not a valid RSS or Atom feed/i)
  })

  it('does not double-decode entities and drops non-web links', () => {
    const xml = `<rss version="2.0"><channel><title>Edge</title>
      <item>
        <title>Literal &amp;lt;tag&amp;gt; kept</title>
        <link>javascript:alert(1)</link>
        <description>ok</description>
      </item>
    </channel></rss>`
    const [entry] = parseFeed(xml, 'https://edge.example.com').entries
    // &amp;lt; decodes once to &lt;, not all the way to <.
    assert.equal(entry.title, 'Literal &lt;tag&gt; kept')
    // A javascript: link is rejected, leaving no link (and no link-based id).
    assert.equal(entry.link, '')
    assert.equal(entry.id, '')
  })
})
