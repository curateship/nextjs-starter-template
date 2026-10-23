// Dependency-free RSS/Atom parser for the RSS Feed source node. Feeds are far
// more regular than arbitrary HTML, so a small, defensively-written extractor is
// enough and avoids adding an XML dependency. It normalizes RSS 2.0, RSS 1.0/RDF,
// and Atom into one entry shape; the executor handles fetching and dedup.

const MAX_ENTRIES_PER_FEED = 200
const MAX_SUMMARY_CHARS = 8_000
const MAX_TITLE_CHARS = 500

export interface ParsedFeedEntry {
  // Best stable identity for dedup (guid/atom id, else the entry link). May be
  // empty when a feed provides neither; the executor then falls back to a hash
  // of the entry content.
  id: string
  title: string
  // Absolute article URL where resolvable, otherwise ''.
  link: string
  // ISO 8601 when the feed's date parsed, the raw value when it did not, or null.
  publishedAt: string | null
  // Plain text, HTML stripped and entities decoded.
  summary: string
}

export interface ParsedFeed {
  format: 'rss' | 'atom'
  title: string
  entries: ParsedFeedEntry[]
}

export function parseFeed(xml: string, baseUrl: string): ParsedFeed {
  const cleaned = xml.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '')
  const isAtom = /<feed[\s>]/i.test(cleaned)
  const isRss =
    /<rss[\s>]/i.test(cleaned) || /<rdf:rdf[\s>]/i.test(cleaned) || /<channel[\s>]/i.test(cleaned)

  if (!isAtom && !isRss) throw new Error('Not a valid RSS or Atom feed')

  const format: 'rss' | 'atom' = isAtom ? 'atom' : 'rss'
  const blocks = matchBlocks(cleaned, format === 'atom' ? 'entry' : 'item').slice(0, MAX_ENTRIES_PER_FEED)
  // The channel/feed title precedes item titles, so the document's first <title>
  // is the feed's own.
  const title = toText(pickRaw(cleaned, 'title'), { html: false }, MAX_TITLE_CHARS) || 'Untitled feed'
  const entries = blocks.map((block) => (format === 'atom' ? parseAtomEntry(block, baseUrl) : parseRssEntry(block, baseUrl)))
  return { format, title, entries }
}

function parseRssEntry(block: string, baseUrl: string): ParsedFeedEntry {
  const title = toText(pickRaw(block, 'title'), { html: false }, MAX_TITLE_CHARS) || 'Untitled entry'
  const guidRaw = pickRaw(block, 'guid')
  const guid = toText(guidRaw, { html: false }, MAX_TITLE_CHARS)
  const linkText = toText(pickRaw(block, 'link'), { html: false }, 2_048)
  const guidIsLink = guid && (isPermalinkGuid(block) || /^https?:\/\//i.test(guid))
  const link = absolute(linkText || (guidIsLink ? guid : ''), baseUrl)
  const summary = toText(pickRaw(block, 'content:encoded') ?? pickRaw(block, 'description'), { html: true }, MAX_SUMMARY_CHARS)
  const publishedAt = normalizeDate(pickRaw(block, 'pubDate') ?? pickRaw(block, 'dc:date') ?? pickRaw(block, 'dc:created'))
  return { id: guid || link, title, link, publishedAt, summary }
}

function parseAtomEntry(block: string, baseUrl: string): ParsedFeedEntry {
  const title = toText(pickRaw(block, 'title'), { html: false }, MAX_TITLE_CHARS) || 'Untitled entry'
  const id = toText(pickRaw(block, 'id'), { html: false }, 2_048)
  const link = absolute(pickAtomLink(block), baseUrl)
  const summary = toText(pickRaw(block, 'content') ?? pickRaw(block, 'summary'), { html: true }, MAX_SUMMARY_CHARS)
  const publishedAt = normalizeDate(pickRaw(block, 'published') ?? pickRaw(block, 'updated'))
  return { id: id || link, title, link, publishedAt, summary }
}

function matchBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
  const blocks: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) blocks.push(match[1])
  return blocks
}

// Inner text of the first matching element, or null. Namespace-qualified names
// (content:encoded, dc:date) are matched literally.
function pickRaw(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')
  const match = re.exec(block)
  return match ? match[1] : null
}

// Atom links are attribute-only (<link href="..." rel="alternate"/>). Prefer the
// alternate/default link and ignore self, enclosure, edit, and related links.
function pickAtomLink(block: string): string {
  const tags = block.match(/<link\b[^>]*\/?>/gi) ?? []
  let fallback = ''
  for (const tag of tags) {
    const attrs = parseAttrs(tag)
    const href = attrs.href
    if (!href) continue
    const rel = attrs.rel?.toLowerCase() ?? 'alternate'
    if (rel === 'alternate') return href
    if (!fallback && rel !== 'self' && rel !== 'enclosure' && rel !== 'edit' && rel !== 'related' && rel !== 'via') {
      fallback = href
    }
  }
  return fallback
}

function isPermalinkGuid(block: string): boolean {
  const tag = /<guid\b[^>]*>/i.exec(block)?.[0]
  if (!tag) return false
  const isPermaLink = parseAttrs(tag).ispermalink?.toLowerCase()
  // RSS 2.0 defaults isPermaLink to true when the attribute is absent.
  return isPermaLink !== 'false'
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g
  let match: RegExpExecArray | null
  while ((match = re.exec(tag)) !== null) {
    const key = (match[1] ?? match[3]).toLowerCase()
    attrs[key] = match[2] ?? match[4] ?? ''
  }
  return attrs
}

function toText(raw: string | null, options: { html: boolean }, max: number): string {
  if (!raw) return ''
  let value = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  // Feeds carry markup two ways: RSS CDATA holds literal tags, while Atom
  // type="html" entity-encodes them. Decode first so entity-encoded tags become
  // real tags, strip all tags, then decode again for entities inside the markup.
  if (options.html) value = decodeEntities(value).replace(/<[^>]+>/g, ' ')
  value = decodeEntities(value).replace(/\s+/g, ' ').trim()
  return value.length > max ? value.slice(0, max) : value
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codePoint(Number(dec)))
    // Decode &amp; last so double-encoded entities are not collapsed twice.
    .replace(/&amp;/gi, '&')
}

function codePoint(point: number): string {
  return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
}

function absolute(link: string, baseUrl: string): string {
  const trimmed = link.trim()
  if (!trimmed) return ''
  try {
    // Feed links are untrusted; only accept web URLs so a javascript:/data: link
    // can never become an emitted document URL.
    const resolved = new URL(trimmed, baseUrl)
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.href : ''
  } catch {
    return ''
  }
}

function normalizeDate(raw: string | null): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? trimmed.slice(0, 100) : parsed.toISOString()
}
